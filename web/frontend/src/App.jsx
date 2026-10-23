import { useEffect, useState } from "react"
import { getJson } from "./api.js"
import GradeOne from "./pages/GradeOne.jsx"
import AnswerSheets from "./pages/AnswerSheets.jsx"
import ScanSheets from "./pages/ScanSheets.jsx"
import ReviewQueue from "./pages/ReviewQueue.jsx"
import Evaluation from "./pages/Evaluation.jsx"
import UseApi from "./pages/UseApi.jsx"

const pages = [
  { key: "grade", label: "Grade one answer" },
  { key: "sheets", label: "Answer sheets" },
  { key: "scan", label: "Scanned sheets (Group 1)" },
  { key: "review", label: "Review queue" },
  { key: "evaluation", label: "Evaluation results" },
  { key: "api", label: "Use the API" },
]

function StatusPanel({ status }) {
  if (!status) {
    return <div className="sidebar-status">Checking the services…</div>
  }
  const health = status.health
  return (
    <div className="sidebar-status">
      <div className="status-line"><span className={"dot " + (status.service_ok ? "on" : "off")} />{status.service_ok ? "Grading API connected" : "Grading API not reachable"}</div>
      {health && <div className="status-line"><span className={"dot " + (health.llm_available ? "on" : "partial")} />{health.llm_available ? "LLM running (" + health.llm_model + ")" : "LLM not running — similarity model only"}</div>}
      {health && <div className="status-line"><span className={"dot " + (health.group1_digitizer_available ? "on" : "partial")} />{health.group1_digitizer_available ? "Group 1 digitizer ready" : "Group 1 digitizer not installed"}</div>}
      <div className="status-line"><span className="dot on" />{status.answers_saved} {status.answers_saved === 1 ? "answer" : "answers"} saved</div>
      <div className="sidebar-note">Marks are recommendations. A teacher makes the final decision. Everything runs on this computer; no answer text is sent to an external AI service.</div>
    </div>
  )
}

export default function App() {
  const [page, setPage] = useState("grade")
  const [status, setStatus] = useState(null)
  const [examples, setExamples] = useState(null)
  const [evaluation, setEvaluation] = useState(null)
  const [startupError, setStartupError] = useState("")

  async function refreshStatus() {
    try {
      setStatus(await getJson("/api/status"))
    } catch (error) {
      setStatus({ service_ok: false, health: null, answers_saved: 0, waiting_for_review: 0, error: error.message })
    }
  }

  useEffect(() => {
    async function start() {
      try {
        await getJson("/api/csrf")
        setExamples(await getJson("/api/examples"))
        setEvaluation(await getJson("/api/evaluation"))
      } catch (error) {
        setStartupError("Cannot reach the Django backend: " + error.message)
      }
      refreshStatus()
    }
    start()
    const timer = setInterval(refreshStatus, 20000)
    return () => clearInterval(timer)
  }, [])

  let reliability = null
  if (evaluation && evaluation.summary) {
    reliability = evaluation.summary.reliability
  }

  let content = null
  if (startupError) {
    content = <div className="banner bad">{startupError}</div>
  } else if (!examples) {
    content = <div className="empty">Loading…</div>
  } else if (page === "grade") {
    content = <GradeOne examples={examples} reliability={reliability} onGraded={refreshStatus} />
  } else if (page === "sheets") {
    content = <AnswerSheets examples={examples} reliability={reliability} onGraded={refreshStatus} />
  } else if (page === "scan") {
    content = <ScanSheets examples={examples} reliability={reliability} status={status} onGraded={refreshStatus} />
  } else if (page === "review") {
    content = <ReviewQueue reliability={reliability} onChanged={refreshStatus} />
  } else if (page === "evaluation") {
    content = <Evaluation evaluation={evaluation} />
  } else {
    content = <UseApi status={status} />
  }

  let waiting = 0
  if (status) {
    waiting = status.waiting_for_review
  }

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <svg width="18" height="18" viewBox="0 0 24 24"><path d="M5 13l4 4 10-11" stroke="white" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </div>
          <div>
            <div className="brand-name">AI Exam Answer Grader</div>
            <div className="brand-sub">SNLP 2026 · Group 2</div>
          </div>
        </div>
        <nav className="nav">
          {pages.map((item) => (
            <button key={item.key} className={page === item.key ? "active" : ""} onClick={() => setPage(item.key)}>
              <span>{item.label}</span>
              {item.key === "review" && waiting > 0 && <span className="nav-count">{waiting}</span>}
            </button>
          ))}
        </nav>
        <StatusPanel status={status} />
      </aside>
      <main className="main">{content}</main>
    </div>
  )
}
