import { useEffect, useState } from "react"
import { AlertTriangle, Check, Info, X } from "lucide-react"
import { colours } from "./charts.jsx"

export function prefersLessMotion() {
  return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

function splitNumber(value) {
  const match = String(value).match(/^(-?\d+(?:\.\d+)?)([\s\S]*)$/)
  if (!match) {
    return null
  }
  let decimals = 0
  if (match[1].indexOf(".") >= 0) {
    decimals = match[1].split(".")[1].length
  }
  return { number: parseFloat(match[1]), decimals: decimals, rest: match[2] }
}

export function CountUp({ value }) {
  const parts = splitNumber(value)
  const [shown, setShown] = useState(0)

  useEffect(() => {
    const target = splitNumber(value)
    if (!target) {
      return undefined
    }
    if (prefersLessMotion()) {
      setShown(target.number)
      return undefined
    }
    let frame = 0
    const start = performance.now()
    function step(now) {
      const progress = Math.min((now - start) / 750, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setShown(target.number * eased)
      if (progress < 1) {
        frame = requestAnimationFrame(step)
      }
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [value])

  if (!parts) {
    return <>{value}</>
  }
  return <>{shown.toFixed(parts.decimals)}{parts.rest}</>
}

export function Metric({ label, value, note, children }) {
  return (
    <div className="metric">
      <div className="metric-label">{label}</div>
      <div className="metric-value"><CountUp value={value} /></div>
      {note && <div className="metric-note">{note}</div>}
      {children}
    </div>
  )
}

export function ConfidenceBar({ value }) {
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const timer = setTimeout(() => setWidth(Math.round(value * 100)), 80)
    return () => clearTimeout(timer)
  }, [value])

  let colour = colours.good
  if (value < 0.6) {
    colour = colours.bad
  } else if (value < 0.8) {
    colour = colours.warn
  }
  return (
    <div className="bar">
      <span style={{ width: width + "%", background: colour }} />
    </div>
  )
}

export function StatusBadge({ status }) {
  if (status === "present") {
    return <span className="badge good">✓ present</span>
  }
  if (status === "partial") {
    return <span className="badge warn">~ partial</span>
  }
  return <span className="badge bad">✗ missing</span>
}

export function ReviewBadge({ needsReview, reviewed }) {
  if (reviewed) {
    return <span className="badge neutral">✓ reviewed</span>
  }
  if (needsReview) {
    return <span className="badge warn">⚠ review</span>
  }
  return <span className="badge good">✓ OK</span>
}

export function OcrBadge({ value }) {
  if (value === null || value === undefined) {
    return <span className="badge neutral">typed</span>
  }
  if (value < 0.8) {
    return <span className="badge bad">OCR {Math.round(value * 100)}% — check text</span>
  }
  return <span className="badge good">OCR {Math.round(value * 100)}%</span>
}

export function Spinner({ dark }) {
  if (dark) {
    return <span className="spinner dark" />
  }
  return <span className="spinner" />
}

export function ErrorBanner({ message }) {
  if (!message) {
    return null
  }
  return <div className="banner bad">✗ {message}</div>
}

export function Skeleton({ blocks }) {
  const heights = blocks || [70, 180, 120]
  return (
    <div className="skeleton-page">
      <div className="skeleton line wide" />
      <div className="skeleton line" />
      {heights.map((height, position) => <div key={position} className="skeleton block" style={{ height: height }} />)}
    </div>
  )
}

export function showToast(message, kind) {
  window.dispatchEvent(new CustomEvent("grader-toast", { detail: { message: message, kind: kind || "good" } }))
}

function toastIcon(kind) {
  if (kind === "bad") {
    return <X size={16} />
  }
  if (kind === "info") {
    return <Info size={16} />
  }
  return <Check size={16} />
}

export function Toasts() {
  const [toasts, setToasts] = useState([])

  useEffect(() => {
    function addToast(event) {
      const id = Date.now() + Math.random()
      const toast = { id: id, message: event.detail.message, kind: event.detail.kind, leaving: false }
      setToasts((list) => [...list.slice(-3), toast])
      setTimeout(() => setToasts((list) => list.map((item) => (item.id === id ? { ...item, leaving: true } : item))), 3400)
      setTimeout(() => setToasts((list) => list.filter((item) => item.id !== id)), 3800)
    }
    window.addEventListener("grader-toast", addToast)
    return () => window.removeEventListener("grader-toast", addToast)
  }, [])

  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={"toast " + toast.kind + (toast.leaving ? " leaving" : "")}>
          <span className="toast-icon">{toastIcon(toast.kind)}</span>
          <span>{toast.message}</span>
        </div>
      ))}
    </div>
  )
}

export function askConfirm(options) {
  return new Promise((resolve) => {
    window.dispatchEvent(new CustomEvent("grader-confirm", { detail: { ...options, resolve: resolve } }))
  })
}

export function ConfirmHost() {
  const [request, setRequest] = useState(null)
  const [closing, setClosing] = useState(false)

  useEffect(() => {
    function openDialog(event) {
      setClosing(false)
      setRequest(event.detail)
    }
    window.addEventListener("grader-confirm", openDialog)
    return () => window.removeEventListener("grader-confirm", openDialog)
  }, [])

  useEffect(() => {
    if (!request) {
      return undefined
    }
    function onKey(event) {
      if (event.key === "Escape") {
        finish(false)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })

  function finish(answer) {
    if (!request || closing) {
      return
    }
    setClosing(true)
    const chosen = request
    setTimeout(() => {
      chosen.resolve(answer)
      setRequest(null)
      setClosing(false)
    }, 180)
  }

  if (!request) {
    return null
  }
  return (
    <div className={"modal-backdrop" + (closing ? " closing" : "")} onClick={() => finish(false)}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <div className={"modal-icon" + (request.danger ? " danger" : "")}>{request.icon || <AlertTriangle size={22} />}</div>
        <h2>{request.title}</h2>
        <p>{request.message}</p>
        <div className="modal-actions">
          <button className="button secondary" onClick={() => finish(false)}>{request.cancelText || "Cancel"}</button>
          <button className={"button " + (request.danger ? "danger-solid" : "primary")} onClick={() => finish(true)} autoFocus>{request.confirmText || "Confirm"}</button>
        </div>
      </div>
    </div>
  )
}
