import { colours } from "./charts.jsx"

export function Metric({ label, value, note, children }) {
  return (
    <div className="metric">
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value}</div>
      {note && <div className="metric-note">{note}</div>}
      {children}
    </div>
  )
}

export function ConfidenceBar({ value }) {
  let colour = colours.good
  if (value < 0.6) {
    colour = colours.bad
  } else if (value < 0.8) {
    colour = colours.warn
  }
  return (
    <div className="bar">
      <span style={{ width: Math.round(value * 100) + "%", background: colour }} />
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
