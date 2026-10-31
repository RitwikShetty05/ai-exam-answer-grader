import { useEffect, useRef, useState } from "react"
import { BarChart3, Check, ClipboardCheck, Code, Files, Layers, Loader2, PenLine, Plug, Power, ScanLine, Workflow } from "lucide-react"
import { getJson, postJson } from "./api.js"
import { ConfirmHost, Skeleton, Toasts, askConfirm, prefersLessMotion } from "./components/ui.jsx"
import GradeOne from "./pages/GradeOne.jsx"
import AnswerSheets from "./pages/AnswerSheets.jsx"
import ScanSheets from "./pages/ScanSheets.jsx"
import ReviewQueue from "./pages/ReviewQueue.jsx"
import Evaluation from "./pages/Evaluation.jsx"
import UseApi from "./pages/UseApi.jsx"
import HowItWorks from "./pages/HowItWorks.jsx"
import TechStack from "./pages/TechStack.jsx"
import CodeExplorer from "./pages/CodeExplorer.jsx"

const navGroups = [
  {
    name: "Grade",
    pages: [
      { key: "grade", label: "Grade one answer", icon: PenLine },
      { key: "sheets", label: "Answer sheets", icon: Files },
      { key: "scan", label: "Scanned sheets (Group 1)", icon: ScanLine },
    ],
  },
  {
    name: "Teacher",
    pages: [
      { key: "review", label: "Review queue", icon: ClipboardCheck },
    ],
  },
  {
    name: "Explore the project",
    pages: [
      { key: "pipeline", label: "End-to-end pipeline", icon: Workflow },
      { key: "stack", label: "Tech stack", icon: Layers },
      { key: "code", label: "Code explorer", icon: Code },
      { key: "evaluation", label: "Evaluation results", icon: BarChart3 },
      { key: "api", label: "Use the API", icon: Plug },
    ],
  },
]

function findPage(key) {
  for (const group of navGroups) {
    for (const page of group.pages) {
      if (page.key === key) {
        return { group: group.name, page: page }
      }
    }
  }
  return { group: "", page: navGroups[0].pages[0] }
}

function addRipple(event) {
  const target = event.target.closest(".button, .nav-item, .chip, .segmented button, .file-item")
  if (!target || target.disabled || prefersLessMotion()) {
    return
  }
  const box = target.getBoundingClientRect()
  const size = Math.max(box.width, box.height) * 1.6
  const ripple = document.createElement("span")
  ripple.className = "ripple"
  ripple.style.width = size + "px"
  ripple.style.height = size + "px"
  ripple.style.left = event.clientX - box.left - size / 2 + "px"
  ripple.style.top = event.clientY - box.top - size / 2 + "px"
  target.appendChild(ripple)
  ripple.addEventListener("animationend", () => ripple.remove())
}

function StatusPanel({ status }) {
  if (!status) {
    return <div className="sidebar-status"><div className="status-line"><span className="dot partial pulse" />Checking the services…</div></div>
  }
  const health = status.health
  return (
    <div className="sidebar-status">
      <div className="status-line"><span className={"dot " + (status.service_ok ? "on pulse" : "off")} />{status.service_ok ? "Grading API connected" : "Grading API not reachable"}</div>
      {health && <div className="status-line"><span className={"dot " + (health.llm_available ? "on pulse" : "partial")} />{health.llm_available ? "LLM running (" + health.llm_model + ")" : "LLM not running — similarity model only"}</div>}
      {health && <div className="status-line"><span className={"dot " + (health.group1_digitizer_available ? "on pulse" : "partial")} />{health.group1_digitizer_available ? "Group 1 digitizer ready" : "Group 1 digitizer not installed"}</div>}
      <div className="status-line"><span className="dot on" />{status.answers_saved} {status.answers_saved === 1 ? "answer" : "answers"} saved</div>
    </div>
  )
}

function StatusPills({ status }) {
  let apiOn = false
  let llmOn = false
  let digitizerOn = false
  if (status && status.service_ok) {
    apiOn = true
  }
  if (status && status.health) {
    llmOn = status.health.llm_available
    digitizerOn = status.health.group1_digitizer_available
  }
  return (
    <div className="pills">
      <span className={"pill " + (apiOn ? "on" : "off")}><i />API</span>
      <span className={"pill " + (llmOn ? "on" : "off")}><i />LLM</span>
      <span className={"pill " + (digitizerOn ? "on" : "off")}><i />Group 1</span>
    </div>
  )
}

function Clock() {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000)
    return () => clearInterval(timer)
  }, [])
  return <span className="clock">{now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
}

function ShutdownScreen({ stage, reply }) {
  let ollamaText = "Ollama: stopped"
  if (reply && !reply.stopped.includes("ollama")) {
    if (reply.ollama_left_running) {
      ollamaText = "Ollama: it was running before the app started, so it is left running"
    } else {
      ollamaText = "Ollama: was not running"
    }
  }
  let apiText = "Grading API: stopped"
  if (reply && !reply.stopped.includes("grading api")) {
    apiText = "Grading API: was not running"
  }
  let steps = [apiText, ollamaText, "Web server: stopped"]
  if (stage !== "done") {
    steps = ["Stopping the grading API…", "Stopping Ollama…", "Stopping the web server…"]
  }
  return (
    <div className="shutdown-screen">
      <div className="shutdown-card">
        <div className={"shutdown-icon " + stage}>
          {stage === "done" ? <Check size={34} /> : <Power size={34} />}
        </div>
        <h1>{stage === "done" ? "The app is shut down" : "Shutting down…"}</h1>
        <div className="shutdown-steps">
          {steps.map((step, position) => (
            <div key={step} className={"shutdown-step" + (stage === "done" ? " done" : "")} style={{ "--i": position }}>
              {stage === "done" ? <Check size={16} /> : <Loader2 size={16} className="spin-icon" />}
              <span>{step}</span>
            </div>
          ))}
        </div>
        {stage === "done" && <p className="shutdown-note">Saved answers and teacher decisions stay in the database. You can close this tab. To start again, double-click <b>Start Grader</b> in the project folder.</p>}
      </div>
    </div>
  )
}

export default function App() {
  const [page, setPage] = useState("grade")
  const [status, setStatus] = useState(null)
  const [examples, setExamples] = useState(null)
  const [evaluation, setEvaluation] = useState(null)
  const [startupError, setStartupError] = useState("")
  const [shutdown, setShutdown] = useState("")
  const [shutdownReply, setShutdownReply] = useState(null)
  const [indicator, setIndicator] = useState({ top: 0, height: 0, ready: false })
  const navRef = useRef(null)
  const timerRef = useRef(null)

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
    timerRef.current = setInterval(refreshStatus, 20000)
    document.addEventListener("pointerdown", addRipple)
    return () => {
      clearInterval(timerRef.current)
      document.removeEventListener("pointerdown", addRipple)
    }
  }, [])

  useEffect(() => {
    function placeIndicator() {
      if (!navRef.current) {
        return
      }
      const active = navRef.current.querySelector(".nav-item.active")
      if (active) {
        setIndicator({ top: active.offsetTop, height: active.offsetHeight, ready: true })
      }
    }
    placeIndicator()
    window.addEventListener("resize", placeIndicator)
    return () => window.removeEventListener("resize", placeIndicator)
  }, [page, status])

  function openPage(key) {
    setPage(key)
    window.scrollTo({ top: 0, behavior: prefersLessMotion() ? "auto" : "smooth" })
  }

  async function shutDown() {
    const yes = await askConfirm({
      title: "Shut down the app?",
      message: "This stops the grading API and the web server, and Ollama too if the start script started it. Saved answers stay in the database. To start again, double-click Start Grader.",
      confirmText: "Shut down",
      danger: true,
      icon: <Power size={22} />,
    })
    if (!yes) {
      return
    }
    clearInterval(timerRef.current)
    setShutdown("stopping")
    try {
      setShutdownReply(await postJson("/api/shutdown", {}))
    } catch {
      setShutdownReply(null)
    }
    setTimeout(() => setShutdown("done"), 2200)
  }

  let reliability = null
  if (evaluation && evaluation.summary) {
    reliability = evaluation.summary.reliability
  }

  let content = null
  if (startupError) {
    content = <div className="banner bad">{startupError}</div>
  } else if (!examples) {
    content = <Skeleton />
  } else if (page === "grade") {
    content = <GradeOne examples={examples} reliability={reliability} onGraded={refreshStatus} />
  } else if (page === "sheets") {
    content = <AnswerSheets examples={examples} reliability={reliability} onGraded={refreshStatus} />
  } else if (page === "scan") {
    content = <ScanSheets examples={examples} reliability={reliability} status={status} onGraded={refreshStatus} />
  } else if (page === "review") {
    content = <ReviewQueue reliability={reliability} onChanged={refreshStatus} />
  } else if (page === "pipeline") {
    content = <HowItWorks examples={examples} status={status} />
  } else if (page === "stack") {
    content = <TechStack status={status} />
  } else if (page === "code") {
    content = <CodeExplorer />
  } else if (page === "evaluation") {
    content = <Evaluation evaluation={evaluation} />
  } else {
    content = <UseApi status={status} />
  }

  let waiting = 0
  if (status) {
    waiting = status.waiting_for_review
  }
  const current = findPage(page)
  const CurrentIcon = current.page.icon

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
        <nav className="nav" ref={navRef}>
          <span className={"nav-indicator" + (indicator.ready ? " ready" : "")} style={{ transform: "translateY(" + indicator.top + "px)", height: indicator.height }} />
          {navGroups.map((group) => (
            <div key={group.name} className="nav-group">
              <div className="nav-group-name">{group.name}</div>
              {group.pages.map((item) => {
                const Icon = item.icon
                return (
                  <button key={item.key} className={"nav-item" + (page === item.key ? " active" : "")} onClick={() => openPage(item.key)}>
                    <Icon size={17} className="nav-icon" />
                    <span className="nav-label">{item.label}</span>
                    {item.key === "review" && waiting > 0 && <span className="nav-count">{waiting}</span>}
                  </button>
                )
              })}
            </div>
          ))}
        </nav>
        <StatusPanel status={status} />
        <button className="button shutdown-button" onClick={shutDown}><Power size={16} />Shut down the app</button>
        <div className="sidebar-note">Marks are recommendations; a teacher makes the final decision. Everything runs on this computer.</div>
      </aside>
      <main className="main">
        <div className="topbar">
          <div className="crumbs">
            <span className="crumb-group">{current.group}</span>
            <span className="crumb-sep">/</span>
            <span className="crumb-page"><CurrentIcon size={15} />{current.page.label}</span>
          </div>
          <div className="topbar-right">
            <StatusPills status={status} />
            <Clock />
          </div>
        </div>
        <div key={page} className="page-transition">{content}</div>
      </main>
      <Toasts />
      <ConfirmHost />
      {shutdown && <ShutdownScreen stage={shutdown} reply={shutdownReply} />}
    </div>
  )
}
