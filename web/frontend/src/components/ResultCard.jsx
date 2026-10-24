import { useState } from "react"
import { postJson } from "../api.js"
import { ConfidenceCurve, ScoreWaterfall } from "./charts.jsx"
import { ConfidenceBar, Metric, StatusBadge } from "./ui.jsx"
import { AnswerPipeline } from "./Pipeline.jsx"

function TeacherDecision({ answerId, result, onSaved }) {
  const [mark, setMark] = useState(String(result.score))
  const [comment, setComment] = useState("")
  const [message, setMessage] = useState("")
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    setMessage("")
    try {
      const reply = await postJson("/api/answers/" + answerId + "/review", { teacher_mark: mark, teacher_comment: comment })
      setMessage("Saved. Final mark: " + reply.answer.final_mark + " / " + result.maximum_score)
      if (onSaved) {
        onSaved(reply.answer)
      }
    } catch (error) {
      setMessage(error.message)
    }
    setSaving(false)
  }

  return (
    <div>
      <div className="section-label">Teacher's decision</div>
      <div className="row">
        <div className="field" style={{ width: 150 }}>
          <label>Final mark (out of {result.maximum_score})</label>
          <input type="number" min="0" max={result.maximum_score} step="0.5" value={mark} onChange={(event) => setMark(event.target.value)} />
        </div>
        <div className="field" style={{ flex: 1, minWidth: 220, marginTop: 0 }}>
          <label>Comment for the record (optional)</label>
          <input value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Why the mark was kept or changed" />
        </div>
        <button className="button primary" style={{ alignSelf: "flex-end" }} onClick={save} disabled={saving}>Save decision</button>
      </div>
      {message && <p className="hint" style={{ marginTop: 6 }}>{message}</p>}
    </div>
  )
}

export default function ResultCard({ result, answerId, humanMark, reliability, onSaved, showDecision }) {
  const [showJson, setShowJson] = useState(false)
  const scores = result.scores_out_of_5 || {}
  let reviewText = "No"
  if (result.needs_human_review) {
    reviewText = "Yes"
  }

  let banners = null
  if (result.needs_human_review) {
    banners = result.review_reasons.map((reason) => <div key={reason} className="banner warn">⚠ {reason}</div>)
  } else if (result.grading_mode === "blank_answer") {
    banners = <div className="banner info">ℹ Blank answer: scored 0 without calling the models.</div>
  } else {
    banners = <div className="banner good">✓ No teacher review needed: the similarity model and the LLM agree.</div>
  }

  return (
    <div className="card">
      <div className="grid-4">
        <Metric label="Recommended mark" value={result.score + " / " + result.maximum_score} note="Advisory — the teacher decides" />
        <Metric label="Confidence" value={Math.round(result.confidence * 100) + "%"} note="Chance of being within ±1 mark of a teacher">
          <ConfidenceBar value={result.confidence} />
        </Metric>
        <Metric label="Teacher review needed" value={reviewText} note={result.review_reasons.length + " reason(s)"} />
        {humanMark !== null && humanMark !== undefined ? <Metric label="Teachers' mark (dataset)" value={humanMark + " / " + result.maximum_score} note="For comparison only" /> : <Metric label="Grading mode" value={result.grading_mode.replace("_", " ")} note={result.seconds + " seconds"} />}
      </div>

      <div style={{ marginTop: 14 }}>{banners}</div>

      <div className="section-label">Pipeline for this answer</div>
      <AnswerPipeline result={result} />

      {result.removed_header && <p className="hint" style={{ marginTop: 10 }}>Header removed before grading: “{result.removed_header}”{result.pages ? " · pages " + result.pages.join(", ") : ""}</p>}

      <div className="section-label">Feedback</div>
      <div className="feedback">{result.feedback}</div>

      {result.concepts && result.concepts.length > 0 && (
        <div>
          <div className="section-label">Rubric check <span style={{ textTransform: "none", fontWeight: 500, letterSpacing: 0 }}>(rubric source: {result.rubric_source})</span></div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Rubric point</th><th>Status</th><th>Student's words (evidence)</th></tr>
              </thead>
              <tbody>
                {result.concepts.map((concept, position) => (
                  <tr key={position}>
                    <td>{concept.concept}</td>
                    <td><StatusBadge status={concept.status} /></td>
                    <td style={{ color: "var(--ink-soft)" }}>{concept.evidence}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {result.wrong_statements && result.wrong_statements.length > 0 && (
        <div>
          <div className="section-label">Statements the LLM judged to be wrong</div>
          {result.wrong_statements.map((statement) => <div key={statement} className="banner bad">✗ {statement}</div>)}
        </div>
      )}

      {result.grading_mode === "full" && scores.rubric_before_penalty !== undefined && (
        <div>
          <div className="section-label">Behind this mark</div>
          <div className="grid-2">
            <div>
              <ScoreWaterfall scores={scores} />
              <p className="chart-caption">Each bar is one real step of the calculation on a 0–5 scale. The similarity model alone gave {scores.similarity_model} out of 5.</p>
            </div>
            {reliability && (
              <div>
                <div className="chart-title">Is this confidence trustworthy?</div>
                <ConfidenceCurve reliability={reliability} confidence={result.confidence} />
                <p className="chart-caption">Blue: how often answers at each confidence level were really within ±1 mark in our evaluation. Orange: this answer.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {showDecision && answerId && <TeacherDecision answerId={answerId} result={result} onSaved={onSaved} />}

      <div style={{ marginTop: 14 }}>
        <button className="button secondary small" onClick={() => setShowJson(!showJson)}>{showJson ? "Hide" : "Show"} the raw API response</button>
        {showJson && <pre className="json">{JSON.stringify(result, null, 2)}</pre>}
      </div>
    </div>
  )
}
