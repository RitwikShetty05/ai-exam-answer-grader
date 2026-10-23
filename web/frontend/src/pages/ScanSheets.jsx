import { useState } from "react"
import { postForm, postJson } from "../api.js"
import ResultCard from "../components/ResultCard.jsx"
import { ErrorBanner, OcrBadge, Spinner } from "../components/ui.jsx"

function emptyKey() {
  return { label: "Q1", question_text: "", reference_answer: "", maximum_marks: "10", rubric_text: "" }
}

function keyFromGroup1(group1Key) {
  if (!group1Key) {
    return emptyKey()
  }
  const label = Object.keys(group1Key.answer_key)[0]
  const item = group1Key.answer_key[label]
  return { label: label, question_text: item.question_text, reference_answer: item.reference_answer, maximum_marks: String(item.maximum_marks), rubric_text: (item.rubric || []).join("\n") }
}

export default function ScanSheets({ examples, reliability, status, onGraded }) {
  const samples = examples.group1_samples || []
  const group1Key = examples.group1_answer_key
  const [mode, setMode] = useState("sample")
  const [sample, setSample] = useState(samples[0] || "")
  const [files, setFiles] = useState([])
  const [pages, setPages] = useState([])
  const [previews, setPreviews] = useState([])
  const [studentId, setStudentId] = useState("")
  const [key, setKey] = useState(keyFromGroup1(group1Key))
  const [busy, setBusy] = useState("")
  const [error, setError] = useState("")
  const [graded, setGraded] = useState(null)

  let digitizerReady = false
  if (status && status.health && status.health.group1_digitizer_available) {
    digitizerReady = true
  }

  function chooseFiles(event) {
    const chosen = Array.from(event.target.files)
    setFiles(chosen)
    setPages([])
    setGraded(null)
  }

  async function readPages() {
    setBusy("read")
    setError("")
    setGraded(null)
    try {
      let reply = null
      let imageLinks = []
      if (mode === "sample") {
        reply = await postJson("/api/scan-sample", { name: sample })
        imageLinks = ["/api/sample-image/" + sample]
        if (group1Key && group1Key.students && group1Key.students[sample.replace(/\.[a-z]+$/i, "")]) {
          setStudentId(group1Key.students[sample.replace(/\.[a-z]+$/i, "")])
        } else {
          setStudentId(reply.pages[0].student_id || "")
        }
        setKey(keyFromGroup1(group1Key))
      } else {
        const formData = new FormData()
        for (const file of files) {
          formData.append("images", file)
          imageLinks.push(URL.createObjectURL(file))
        }
        reply = await postForm("/api/scan", formData)
        setStudentId(reply.pages[0].student_id || "")
      }
      setPages(reply.pages)
      setPreviews(imageLinks)
    } catch (problem) {
      setError(problem.message)
    }
    setBusy("")
  }

  function editPage(position, text) {
    const copy = pages.slice()
    copy[position] = { ...copy[position], answer_text: text }
    setPages(copy)
  }

  async function grade() {
    setBusy("grade")
    setError("")
    const rubric = []
    for (const line of key.rubric_text.split("\n")) {
      if (line.trim() !== "") {
        rubric.push(line.trim())
      }
    }
    const answerKey = {}
    answerKey[key.label] = { question_text: key.question_text, reference_answer: key.reference_answer, maximum_marks: Number(key.maximum_marks), rubric: rubric }
    try {
      const reply = await postJson("/api/grade-scan", { answer_key: answerKey, pages: pages, student_id: studentId, exam_name: "Scanned sheet " + (studentId || "") })
      setGraded(reply)
      onGraded()
    } catch (problem) {
      setError(problem.message)
    }
    setBusy("")
  }

  let step = 1
  if (pages.length > 0) {
    step = 2
  }
  if (graded) {
    step = 3
  }

  return (
    <div>
      <div className="page-head">
        <h1>Scanned answer sheets (Group 1 → Group 2)</h1>
        <p>The full AI University pipeline: Group 1's Handwritten Exam Digitizer reads a photographed answer sheet, the teacher checks the text, and our grader marks it. Our adapter removes the name and roll-number header, finds the question number even when the OCR misreads it, joins answers that continue on the next page, and tells the LLM that the text came from OCR.</p>
      </div>

      <div className="steps">
        <div className={"step " + (step === 1 ? "current" : "done")}><strong>1. Read the pages</strong>Group 1's digitize_page()</div>
        <div className={"step " + (step === 2 ? "current" : step > 2 ? "done" : "")}><strong>2. Check the text and answer key</strong>The teacher can correct OCR mistakes</div>
        <div className={"step " + (step === 3 ? "current" : "")}><strong>3. Grade and review</strong>Our grader, then the teacher's decision</div>
      </div>

      {!digitizerReady && <div className="banner warn" style={{ marginBottom: 14 }}>⚠ Group 1's digitizer is not available on this computer (it needs their project folder next to ours and Tesseract installed). You can still paste OCR text on the “Grade one answer” page.</div>}

      <div className="card">
        <div className="segmented">
          <button className={mode === "sample" ? "active" : ""} onClick={() => setMode("sample")}>Group 1's sample pages</button>
          <button className={mode === "upload" ? "active" : ""} onClick={() => setMode("upload")}>Upload page photos</button>
        </div>
        <div className="row" style={{ marginTop: 14, alignItems: "flex-end" }}>
          {mode === "sample" ? (
            <div className="field" style={{ minWidth: 300 }}>
              <label>Sample answer sheet from Group 1's repository</label>
              <select value={sample} onChange={(event) => setSample(event.target.value)}>
                {samples.map((name) => <option key={name}>{name}</option>)}
              </select>
            </div>
          ) : (
            <div className="field" style={{ minWidth: 340 }}>
              <label>Page photos (.jpg or .png), in page order</label>
              <input type="file" accept=".jpg,.jpeg,.png" multiple onChange={chooseFiles} />
            </div>
          )}
          <button className="button primary" onClick={readPages} disabled={busy !== "" || !digitizerReady || (mode === "upload" && files.length === 0)}>{busy === "read" && <Spinner />}{busy === "read" ? "Reading with Group 1's digitizer…" : "Read with Group 1's digitizer"}</button>
        </div>
        <div style={{ marginTop: 10 }}><ErrorBanner message={error} /></div>
      </div>

      {pages.length > 0 && (
        <div className="card">
          <div className="card-title"><h2>What Group 1's digitizer read</h2><p>Correct the text if needed; the mark is only as good as the transcription.</p></div>
          {pages.map((page, position) => (
            <div key={position} className="grid-2" style={{ marginBottom: 16 }}>
              <div>
                <img className="page-preview" src={previews[position]} alt={"Scanned page " + (position + 1)} />
              </div>
              <div>
                <div className="row" style={{ marginBottom: 8 }}>
                  <strong>Page {page.page || position + 1}</strong>
                  <OcrBadge value={page.ocr_confidence} />
                  <span className="badge neutral">student ID read: {page.student_id || "none"}</span>
                  <span className="badge neutral">question read: {page.question || "none"}</span>
                </div>
                <textarea className="ocr-text" value={page.answer_text} onChange={(event) => editPage(position, event.target.value)} />
              </div>
            </div>
          ))}

          <div className="section-label">Answer key and student</div>
          <div className="grid-2">
            <div>
              <div className="row">
                <div className="field" style={{ width: 110 }}>
                  <label>Question label</label>
                  <input value={key.label} onChange={(event) => setKey({ ...key, label: event.target.value })} />
                </div>
                <div className="field" style={{ width: 130, marginTop: 0 }}>
                  <label>Maximum marks</label>
                  <input type="number" value={key.maximum_marks} onChange={(event) => setKey({ ...key, maximum_marks: event.target.value })} />
                </div>
                <div className="field" style={{ flex: 1, marginTop: 0 }}>
                  <label>Student ID (type it if the OCR could not read it)</label>
                  <input value={studentId} onChange={(event) => setStudentId(event.target.value)} />
                </div>
              </div>
              <div className="field">
                <label>Question</label>
                <textarea rows={2} value={key.question_text} onChange={(event) => setKey({ ...key, question_text: event.target.value })} />
              </div>
              <div className="field">
                <label>Reference answer</label>
                <textarea rows={6} value={key.reference_answer} onChange={(event) => setKey({ ...key, reference_answer: event.target.value })} />
              </div>
            </div>
            <div>
              <div className="field">
                <label>Rubric (one key point per line)</label>
                <textarea rows={11} value={key.rubric_text} onChange={(event) => setKey({ ...key, rubric_text: event.target.value })} />
              </div>
              {group1Key && mode === "sample" && <p className="hint">{group1Key.description}</p>}
            </div>
          </div>
          <div className="row" style={{ marginTop: 16 }}>
            <button className="button primary" onClick={grade} disabled={busy !== "" || key.question_text.trim() === "" || key.reference_answer.trim() === ""}>{busy === "grade" && <Spinner />}{busy === "grade" ? "Grading… (long answers take about 20 seconds)" : "Grade this answer sheet"}</button>
          </div>
        </div>
      )}

      {graded && graded.answers.map((answer) => (
        <div key={answer.id}>
          <h2 style={{ margin: "22px 0 10px" }}>Result: {answer.student_id || "unknown student"} — {answer.question} (pages {answer.pages.join(", ")})</h2>
          <ResultCard result={answer.result} answerId={answer.id} reliability={reliability} onSaved={onGraded} showDecision={true} />
        </div>
      ))}
    </div>
  )
}
