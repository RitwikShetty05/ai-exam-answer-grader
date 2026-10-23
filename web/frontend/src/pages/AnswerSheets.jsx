import { useState } from "react"
import { postJson } from "../api.js"
import ResultCard from "../components/ResultCard.jsx"
import { ConceptStack, Corridor, HorizontalCounts, colours } from "../components/charts.jsx"
import { ErrorBanner, OcrBadge, ReviewBadge, Spinner } from "../components/ui.jsx"

function firstReason(answer) {
  if (!answer.needs_review) {
    return "Marked automatically"
  }
  const reasons = answer.review_reasons.join(" ").toLowerCase()
  if (reasons.indexOf("ocr") >= 0) {
    return "Low OCR confidence"
  }
  if (reasons.indexOf("instruction") >= 0) {
    return "Instruction-like text"
  }
  if (reasons.indexOf("low confidence") >= 0) {
    return "Low confidence"
  }
  if (reasons.indexOf("differ by") >= 0) {
    return "LLM and rubric disagree"
  }
  if (reasons.indexOf("long answer") >= 0) {
    return "Long answer"
  }
  return "Other reason"
}

function Overview({ answers }) {
  const points = []
  const routing = {}
  const concepts = {}
  for (const answer of answers) {
    if (answer.human_mark !== null && answer.human_mark !== undefined) {
      points.push({ x: (answer.human_mark / answer.maximum_score) * 5, y: (answer.recommended_score / answer.maximum_score) * 5, label: answer.student_id + " " + answer.question })
    }
    const reason = firstReason(answer)
    routing[reason] = (routing[reason] || 0) + 1
    if (!concepts[answer.question]) {
      concepts[answer.question] = { name: answer.question, present: 0, partial: 0, missing: 0 }
    }
    for (const concept of answer.result.concepts || []) {
      if (concepts[answer.question][concept.status] !== undefined) {
        concepts[answer.question][concept.status] = concepts[answer.question][concept.status] + 1
      }
    }
  }
  const routingRows = []
  for (const name of Object.keys(routing)) {
    let colour = colours.warn
    if (name === "Marked automatically") {
      colour = colours.blue
    }
    routingRows.push({ name: name, value: routing[name], colour: colour })
  }
  const conceptRows = Object.values(concepts).sort((first, second) => first.name.localeCompare(second.name))
  return (
    <div className="card">
      <div className="card-title"><h2>Batch overview</h2></div>
      <div className="grid-2">
        <div>
          <div className="chart-title">Grader vs teachers' marks (scaled to 5)</div>
          {points.length > 0 ? <Corridor points={points} height={280} /> : <div className="empty">No teacher marks in this file.</div>}
          <p className="chart-caption">Dots inside the blue band are within ±1 mark of the teachers' mark.</p>
        </div>
        <div>
          <div className="chart-title">Where the answers went</div>
          <HorizontalCounts rows={routingRows} valueLabel="answers" />
          <div className="chart-title" style={{ marginTop: 14 }}>Rubric points per question (all students)</div>
          <ConceptStack rows={conceptRows} />
        </div>
      </div>
    </div>
  )
}

export default function AnswerSheets({ examples, reliability, onGraded }) {
  const [sourceType, setSourceType] = useState("sample")
  const [exam, setExam] = useState(examples.sample_exam)
  const [uploadError, setUploadError] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [batch, setBatch] = useState(null)
  const [marks, setMarks] = useState({})
  const [comments, setComments] = useState({})
  const [saved, setSaved] = useState({})
  const [chosen, setChosen] = useState(null)

  function chooseSource(type) {
    setSourceType(type)
    setBatch(null)
    setUploadError("")
    if (type === "sample") {
      setExam(examples.sample_exam)
    } else if (type === "upload example" && examples.upload_example) {
      setExam(examples.upload_example)
    } else {
      setExam(null)
    }
  }

  function readFile(event) {
    const file = event.target.files[0]
    if (!file) {
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result)
        if (!data.answer_key || !data.answers) {
          throw new Error("The file needs 'answer_key' and 'answers'.")
        }
        setExam(data)
        setUploadError("")
      } catch (problem) {
        setUploadError("Could not read " + file.name + ": " + problem.message)
        setExam(null)
      }
    }
    reader.readAsText(file)
  }

  async function gradeAll() {
    setBusy(true)
    setError("")
    try {
      const reply = await postJson("/api/grade-batch", { exam_name: exam.description || "Answer sheets", answer_key: exam.answer_key, answers: exam.answers, human_marks: exam.human_marks || {} })
      setBatch(reply)
      const startMarks = {}
      for (const answer of reply.answers) {
        startMarks[answer.id] = String(answer.recommended_score)
      }
      setMarks(startMarks)
      setComments({})
      setSaved({})
      setChosen(reply.answers[0].id)
      onGraded()
    } catch (problem) {
      setError(problem.message)
    }
    setBusy(false)
  }

  async function saveRow(answer) {
    try {
      await postJson("/api/answers/" + answer.id + "/review", { teacher_mark: marks[answer.id], teacher_comment: comments[answer.id] || "" })
      setSaved({ ...saved, [answer.id]: "saved" })
      onGraded()
    } catch (problem) {
      setSaved({ ...saved, [answer.id]: problem.message })
    }
  }

  let chosenAnswer = null
  if (batch && chosen !== null) {
    for (const answer of batch.answers) {
      if (answer.id === chosen) {
        chosenAnswer = answer
      }
    }
  }

  return (
    <div>
      <div className="page-head">
        <h1>Grade answer sheets</h1>
        <p>Grade a whole set of answers in Group 1's digitizer format: one record per answer with <code>student_id</code>, <code>question</code>, <code>answer_text</code>, <code>page</code> and <code>confidence</code>, plus an answer key. The teacher then confirms or changes each mark.</p>
      </div>

      <div className="card">
        <div className="segmented">
          <button className={sourceType === "sample" ? "active" : ""} onClick={() => chooseSource("sample")}>Sample exam (Mohler)</button>
          <button className={sourceType === "upload example" ? "active" : ""} onClick={() => chooseSource("upload example")}>Example with OCR confidence</button>
          <button className={sourceType === "upload" ? "active" : ""} onClick={() => chooseSource("upload")}>Upload a JSON file</button>
        </div>
        {sourceType === "upload" && (
          <div className="field" style={{ marginTop: 14, maxWidth: 520 }}>
            <label>JSON file with "answer_key" and "answers" (same layout as demo exam.json)</label>
            <input type="file" accept=".json,application/json" onChange={readFile} />
            <ErrorBanner message={uploadError} />
          </div>
        )}
        {exam && (
          <div style={{ marginTop: 16 }}>
            {exam.description && <p className="hint" style={{ marginBottom: 10 }}>{exam.description}</p>}
            <div className="table-wrap">
              <table>
                <thead><tr><th>Student</th><th>Question</th><th>Answer text</th><th>Page</th><th>OCR</th></tr></thead>
                <tbody>
                  {exam.answers.map((record, position) => (
                    <tr key={position}>
                      <td>{record.student_id}</td>
                      <td>{record.question}</td>
                      <td style={{ maxWidth: 520 }}>{record.answer_text}</td>
                      <td className="number">{record.page}</td>
                      <td><OcrBadge value={record.confidence} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="row" style={{ marginTop: 14 }}>
              <button className="button primary" onClick={gradeAll} disabled={busy}>{busy && <Spinner />}{busy ? "Grading " + exam.answers.length + " answers (about 8 seconds each)…" : "Grade all answers"}</button>
            </div>
            <div style={{ marginTop: 10 }}><ErrorBanner message={error} /></div>
          </div>
        )}
      </div>

      {batch && (
        <div className="card">
          <div className="card-title">
            <h2>Teacher review</h2>
            <p>{batch.answers_graded} answers graded, {batch.answers_needing_review} flagged for review · <a href="/api/answers.csv">download all marks (CSV)</a></p>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Status</th><th>Student</th><th>Question</th><th className="number">Recommended</th><th className="number">Confidence</th><th className="number">Teachers' mark</th><th>Final mark</th><th>Comment</th><th></th></tr>
              </thead>
              <tbody>
                {batch.answers.map((answer) => (
                  <tr key={answer.id} style={{ background: chosen === answer.id ? "var(--brand-soft)" : undefined }}>
                    <td><ReviewBadge needsReview={answer.needs_review} reviewed={saved[answer.id] === "saved"} /></td>
                    <td>{answer.student_id}</td>
                    <td>{answer.question}</td>
                    <td className="number">{answer.recommended_score} / {answer.maximum_score}</td>
                    <td className="number">{Math.round(answer.confidence * 100)}%</td>
                    <td className="number">{answer.human_mark === null ? "–" : answer.human_mark}</td>
                    <td><input type="number" step="0.5" min="0" max={answer.maximum_score} value={marks[answer.id] || ""} onChange={(event) => setMarks({ ...marks, [answer.id]: event.target.value })} style={{ width: 80 }} /></td>
                    <td><input value={comments[answer.id] || ""} onChange={(event) => setComments({ ...comments, [answer.id]: event.target.value })} style={{ minWidth: 150 }} /></td>
                    <td>
                      <div className="row" style={{ flexWrap: "nowrap" }}>
                        <button className="button secondary small" onClick={() => saveRow(answer)}>Save</button>
                        <button className="button secondary small" onClick={() => setChosen(answer.id)}>Details</button>
                      </div>
                      {saved[answer.id] && saved[answer.id] !== "saved" && <div className="hint">{saved[answer.id]}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {batch && <Overview answers={batch.answers} />}

      {chosenAnswer && (
        <div>
          <h2 style={{ margin: "22px 0 10px" }}>Details: {chosenAnswer.student_id} — {chosenAnswer.question}</h2>
          <ResultCard result={chosenAnswer.result} answerId={chosenAnswer.id} humanMark={chosenAnswer.human_mark} reliability={reliability} showDecision={false} />
        </div>
      )}
    </div>
  )
}
