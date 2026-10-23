import { useState } from "react"
import { postJson } from "../api.js"
import ResultCard from "../components/ResultCard.jsx"
import { ErrorBanner, Spinner } from "../components/ui.jsx"

function formFromExample(example) {
  return {
    title: example.title,
    question_id: "Q1",
    question_text: example.question_text,
    reference_answer: example.reference_answer,
    student_answer: example.student_answer,
    maximum_marks: String(example.maximum_marks),
    rubric_text: "",
    human_mark: example.human_mark,
  }
}

export default function GradeOne({ examples, reliability, onGraded }) {
  const [form, setForm] = useState(formFromExample(examples.single_examples[0]))
  const [fromOcr, setFromOcr] = useState(false)
  const [ocrConfidence, setOcrConfidence] = useState(0.9)
  const [busy, setBusy] = useState("")
  const [error, setError] = useState("")
  const [graded, setGraded] = useState(null)

  function update(name, value) {
    setForm({ ...form, [name]: value })
  }

  function chooseExample(title) {
    for (const example of examples.single_examples) {
      if (example.title === title) {
        setForm(formFromExample(example))
        setGraded(null)
        setError("")
      }
    }
  }

  async function suggestRubric() {
    setBusy("rubric")
    setError("")
    try {
      const reply = await postJson("/api/rubric", { question_text: form.question_text, reference_answer: form.reference_answer })
      update("rubric_text", reply.rubric.join("\n"))
    } catch (problem) {
      setError(problem.message)
    }
    setBusy("")
  }

  async function grade() {
    setBusy("grade")
    setError("")
    const rubric = []
    for (const line of form.rubric_text.split("\n")) {
      if (line.trim() !== "") {
        rubric.push(line.trim())
      }
    }
    let ocrValue = null
    if (fromOcr) {
      ocrValue = ocrConfidence
    }
    let humanMark = null
    if (form.human_mark !== null && form.human_mark !== undefined) {
      humanMark = Math.round((form.human_mark / 5) * Number(form.maximum_marks) * 100) / 100
    }
    try {
      const reply = await postJson("/api/grade", {
        question_id: form.question_id,
        question_text: form.question_text,
        reference_answer: form.reference_answer,
        student_answer: form.student_answer,
        maximum_marks: form.maximum_marks,
        rubric: rubric,
        ocr_confidence: ocrValue,
        human_mark: humanMark,
      })
      setGraded({ id: reply.id, result: reply.result, humanMark: humanMark })
      onGraded()
    } catch (problem) {
      setError(problem.message)
    }
    setBusy("")
  }

  return (
    <div>
      <div className="page-head">
        <h1>Grade one answer</h1>
        <p>Enter a question, the teacher's reference answer and a student's answer. The grader recommends a mark, explains it point by point, and says how sure it is. Every graded answer is saved to the review queue.</p>
      </div>

      <div className="card">
        <div className="field" style={{ maxWidth: 520 }}>
          <label>Load an example from the Mohler dataset</label>
          <select value={form.title} onChange={(event) => chooseExample(event.target.value)}>
            {examples.single_examples.map((example) => <option key={example.title}>{example.title}</option>)}
          </select>
        </div>
        <div className="grid-2" style={{ marginTop: 16 }}>
          <div>
            <div className="field">
              <label>Question label</label>
              <input value={form.question_id} onChange={(event) => update("question_id", event.target.value)} />
            </div>
            <div className="field">
              <label>Question</label>
              <textarea rows={2} value={form.question_text} onChange={(event) => update("question_text", event.target.value)} />
            </div>
            <div className="field">
              <label>Reference answer (from the teacher)</label>
              <textarea rows={4} value={form.reference_answer} onChange={(event) => update("reference_answer", event.target.value)} />
            </div>
            <div className="field" style={{ maxWidth: 180 }}>
              <label>Maximum marks</label>
              <input type="number" min="1" max="100" step="1" value={form.maximum_marks} onChange={(event) => update("maximum_marks", event.target.value)} />
            </div>
          </div>
          <div>
            <div className="field">
              <label>Marking rubric (optional, one key point per line)</label>
              <textarea rows={4} value={form.rubric_text} onChange={(event) => update("rubric_text", event.target.value)} placeholder="Leave empty to use a saved rubric or let the LLM make one" />
              <div className="row">
                <button className="button secondary small" onClick={suggestRubric} disabled={busy !== ""}>{busy === "rubric" && <Spinner dark />}Suggest a rubric from the reference answer</button>
              </div>
            </div>
            <div className="field">
              <label>Student's answer</label>
              <textarea rows={4} value={form.student_answer} onChange={(event) => update("student_answer", event.target.value)} />
            </div>
            <div className="field">
              <label className="row" style={{ fontWeight: 500 }}>
                <input type="checkbox" checked={fromOcr} onChange={(event) => setFromOcr(event.target.checked)} style={{ width: "auto" }} />
                This answer was read by OCR (Group 1)
              </label>
              {fromOcr && (
                <div className="row">
                  <input type="range" min="0" max="1" step="0.01" value={ocrConfidence} onChange={(event) => setOcrConfidence(Number(event.target.value))} style={{ maxWidth: 260 }} />
                  <span className="hint">OCR confidence {ocrConfidence.toFixed(2)} {ocrConfidence < 0.8 ? "(will be flagged)" : ""}</span>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="row" style={{ marginTop: 18 }}>
          <button className="button primary" onClick={grade} disabled={busy !== ""}>{busy === "grade" && <Spinner />}{busy === "grade" ? "Grading… (about 10 seconds)" : "Grade answer"}</button>
        </div>
        <div style={{ marginTop: 12 }}><ErrorBanner message={error} /></div>
      </div>

      {graded && <ResultCard result={graded.result} answerId={graded.id} humanMark={graded.humanMark} reliability={reliability} onSaved={onGraded} showDecision={true} />}
    </div>
  )
}
