import { useEffect, useState } from "react"
import { getJson, postJson } from "../api.js"
import ResultCard from "../components/ResultCard.jsx"
import { ErrorBanner, OcrBadge, ReviewBadge, Spinner } from "../components/ui.jsx"

export default function ReviewQueue({ reliability, onChanged }) {
  const [filter, setFilter] = useState("waiting")
  const [answers, setAnswers] = useState(null)
  const [error, setError] = useState("")
  const [marks, setMarks] = useState({})
  const [comments, setComments] = useState({})
  const [messages, setMessages] = useState({})
  const [open, setOpen] = useState(null)

  async function load() {
    setError("")
    try {
      const reply = await getJson("/api/answers")
      setAnswers(reply.answers)
      const startMarks = {}
      const startComments = {}
      for (const answer of reply.answers) {
        startMarks[answer.id] = String(answer.final_mark)
        startComments[answer.id] = answer.teacher_comment
      }
      setMarks(startMarks)
      setComments(startComments)
    } catch (problem) {
      setError(problem.message)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function save(answer) {
    try {
      const reply = await postJson("/api/answers/" + answer.id + "/review", { teacher_mark: marks[answer.id], teacher_comment: comments[answer.id] || "" })
      const updated = answers.map((item) => (item.id === answer.id ? reply.answer : item))
      setAnswers(updated)
      setMessages({ ...messages, [answer.id]: "saved" })
      onChanged()
    } catch (problem) {
      setMessages({ ...messages, [answer.id]: problem.message })
    }
  }

  if (answers === null) {
    return <div className="empty"><Spinner dark /> Loading saved answers…</div>
  }

  const shown = []
  let waitingCount = 0
  for (const answer of answers) {
    if (answer.needs_review && !answer.reviewed) {
      waitingCount = waitingCount + 1
    }
    if (filter === "waiting" && !(answer.needs_review && !answer.reviewed)) {
      continue
    }
    if (filter === "flagged" && !answer.needs_review) {
      continue
    }
    shown.push(answer)
  }

  return (
    <div>
      <div className="page-head">
        <h1>Review queue</h1>
        <p>Every answer graded in this app is saved in the database with the recommended mark, the reasons it was flagged and the teacher's decision. Flagged answers wait here until a teacher confirms or changes the mark.</p>
      </div>
      <div className="card">
        <div className="row spread">
          <div className="segmented">
            <button className={filter === "waiting" ? "active" : ""} onClick={() => setFilter("waiting")}>Waiting for review ({waitingCount})</button>
            <button className={filter === "flagged" ? "active" : ""} onClick={() => setFilter("flagged")}>All flagged</button>
            <button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>All answers ({answers.length})</button>
          </div>
          <div className="row">
            <button className="button secondary small" onClick={load}>Refresh</button>
            <a className="button secondary small" href="/api/answers.csv">Download CSV</a>
          </div>
        </div>
        <div style={{ marginTop: 10 }}><ErrorBanner message={error} /></div>
        <div className="table-wrap" style={{ marginTop: 14 }}>
          <table>
            <thead>
              <tr><th>Status</th><th>Graded</th><th>Source</th><th>Student</th><th>Question</th><th className="number">Recommended</th><th className="number">Confidence</th><th>Text</th><th>Final mark</th><th>Comment</th><th></th></tr>
            </thead>
            <tbody>
              {shown.length === 0 && <tr><td colSpan={11} className="empty">Nothing here yet.</td></tr>}
              {shown.map((answer) => (
                <tr key={answer.id}>
                  <td><ReviewBadge needsReview={answer.needs_review} reviewed={answer.reviewed} /></td>
                  <td style={{ whiteSpace: "nowrap" }}>{new Date(answer.created_at).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}</td>
                  <td>{answer.source}</td>
                  <td>{answer.student_id || "–"}</td>
                  <td>{answer.question || "–"}</td>
                  <td className="number">{answer.recommended_score} / {answer.maximum_score}</td>
                  <td className="number">{Math.round(answer.confidence * 100)}%</td>
                  <td><OcrBadge value={answer.ocr_confidence} /></td>
                  <td><input type="number" step="0.5" min="0" max={answer.maximum_score} value={marks[answer.id] || ""} onChange={(event) => setMarks({ ...marks, [answer.id]: event.target.value })} style={{ width: 80 }} /></td>
                  <td><input value={comments[answer.id] || ""} onChange={(event) => setComments({ ...comments, [answer.id]: event.target.value })} style={{ minWidth: 120 }} /></td>
                  <td>
                    <div className="row" style={{ flexWrap: "nowrap" }}>
                      <button className="button secondary small" onClick={() => save(answer)}>Save</button>
                      <button className="button secondary small" onClick={() => setOpen(open === answer.id ? null : answer.id)}>{open === answer.id ? "Close" : "Details"}</button>
                    </div>
                    {messages[answer.id] && messages[answer.id] !== "saved" && <div className="hint">{messages[answer.id]}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {open !== null && answers.filter((answer) => answer.id === open).map((answer) => (
        <div key={answer.id}>
          <h2 style={{ margin: "22px 0 10px" }}>{answer.student_id || "Answer"} — {answer.question}</h2>
          {answer.question_text && <p className="hint" style={{ marginBottom: 6 }}>Question: {answer.question_text}</p>}
          <div className="card" style={{ marginBottom: 12 }}><div className="section-label" style={{ marginTop: 0 }}>Student's answer as graded</div><p>{answer.answer_text}</p></div>
          <ResultCard result={answer.result} answerId={answer.id} humanMark={answer.human_mark} reliability={reliability} showDecision={false} />
        </div>
      ))}
    </div>
  )
}
