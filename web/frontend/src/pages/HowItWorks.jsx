import { useEffect, useState } from "react"
import { Pause, Play, RotateCcw, Sparkles } from "lucide-react"
import { postJson } from "../api.js"
import { AnswerPipeline, PipelineDiagram, StepDetail, pipelineSteps, stageOrder, stepPosition } from "../components/Pipeline.jsx"
import { ConfidenceBar, Metric, Spinner } from "../components/ui.jsx"

function StageProgress({ selected, started }) {
  const current = pipelineSteps[stepPosition(selected)].stage
  const currentStage = stageOrder.indexOf(current)
  let filled = 0
  if (started) {
    filled = (currentStage / (stageOrder.length - 1)) * 100
  }
  return (
    <div className="stage-progress">
      <div className="stage-track"><span style={{ width: filled + "%" }} /></div>
      {stageOrder.map((stage, position) => {
        let className = "stage-chip"
        if (started && position < currentStage) {
          className = className + " done"
        }
        if (started && position === currentStage) {
          className = className + " current"
        }
        return (
          <div key={stage} className={className}>
            <span className="stage-dot">{position + 1}</span>
            <span className="stage-name">{stage}</span>
          </div>
        )
      })}
    </div>
  )
}

function LiveRun({ examples, status }) {
  const choices = examples.single_examples || []
  const [choice, setChoice] = useState(0)
  const [state, setState] = useState("idle")
  const [result, setResult] = useState(null)
  const [error, setError] = useState("")
  const [seconds, setSeconds] = useState(0)
  const [activeStage, setActiveStage] = useState(0)

  useEffect(() => {
    if (state !== "running") {
      return undefined
    }
    const started = Date.now()
    const timer = setInterval(() => {
      const elapsed = (Date.now() - started) / 1000
      setSeconds(elapsed)
      setActiveStage(Math.floor(elapsed / 1.4) % stageOrder.length)
    }, 200)
    return () => clearInterval(timer)
  }, [state])

  async function run() {
    const example = choices[choice]
    setState("running")
    setResult(null)
    setError("")
    setSeconds(0)
    try {
      const reply = await postJson("/api/grade", {
        question_text: example.question_text,
        reference_answer: example.reference_answer,
        student_answer: example.student_answer,
        maximum_marks: example.maximum_marks,
        rubric: example.rubric,
        save: false,
      })
      setResult(reply.result)
      setState("done")
    } catch (problem) {
      setError(problem.message)
      setState("idle")
    }
  }

  const serviceReady = status && status.service_ok
  const example = choices[choice]
  return (
    <div className="card live-run">
      <div className="card-title">
        <h2><Sparkles size={18} className="title-icon" />Run a real answer through the pipeline</h2>
        <p>Not saved to the review queue</p>
      </div>
      <div className="row">
        <select value={choice} onChange={(event) => setChoice(Number(event.target.value))} style={{ maxWidth: 420 }} disabled={state === "running"}>
          {choices.map((item, position) => <option key={item.title} value={position}>{item.title}</option>)}
        </select>
        <button className="button primary" onClick={run} disabled={state === "running" || !serviceReady}>
          {state === "running" ? <Spinner /> : <Play size={16} />}
          {state === "running" ? "Grading… " + seconds.toFixed(1) + " s" : "Run it end to end"}
        </button>
        {!serviceReady && <span className="hint">The grading API is not connected, so this is switched off.</span>}
      </div>
      {example && (
        <div className="live-example">
          <div><span className="metric-label">Question</span><p>{example.question_text}</p></div>
          <div><span className="metric-label">Student's answer</span><p>“{example.student_answer}”</p></div>
        </div>
      )}
      {state === "running" && (
        <div className="live-stages">
          {stageOrder.map((stage, position) => (
            <div key={stage} className={"live-stage" + (position === activeStage ? " active" : "") + (position < activeStage ? " passed" : "")}>
              <span className="live-stage-dot" />
              {stage}
            </div>
          ))}
          <p className="hint">The answer is inside the grader now: the similarity model, the local LLM and the rubric check take about 5–10 seconds.</p>
        </div>
      )}
      {error && <div className="banner bad" style={{ marginTop: 12 }}>✗ {error}</div>}
      {result && (
        <div className="live-result">
          <div className="grid-4">
            <Metric label="Final mark" value={result.score + " / " + result.maximum_score} note="Advisory" />
            <Metric label="Confidence" value={Math.round(result.confidence * 100) + "%"} note="Within ±1 mark of a teacher">
              <ConfidenceBar value={result.confidence} />
            </Metric>
            <Metric label="Decision" value={result.needs_human_review ? "Teacher" : "Automatic"} note={result.review_reasons.length + " review reason(s)"} />
            <Metric label="Time" value={result.seconds + " s"} note={"Mode: " + result.grading_mode.replace("_", " ")} />
          </div>
          <div className="section-label">What happened at each step</div>
          <AnswerPipeline result={result} />
        </div>
      )}
    </div>
  )
}

export default function HowItWorks({ examples, status }) {
  const [selected, setSelected] = useState(pipelineSteps[0].key)
  const [playing, setPlaying] = useState(false)
  const [started, setStarted] = useState(false)

  useEffect(() => {
    if (!playing) {
      return undefined
    }
    const position = stepPosition(selected)
    const timer = setTimeout(() => {
      if (position + 1 >= pipelineSteps.length) {
        setPlaying(false)
      } else {
        setSelected(pipelineSteps[position + 1].key)
      }
    }, 2400)
    return () => clearTimeout(timer)
  }, [playing, selected])

  function togglePlay() {
    if (playing) {
      setPlaying(false)
      return
    }
    if (stepPosition(selected) >= pipelineSteps.length - 1) {
      setSelected(pipelineSteps[0].key)
    }
    setStarted(true)
    setPlaying(true)
  }

  function reset() {
    setPlaying(false)
    setStarted(false)
    setSelected(pipelineSteps[0].key)
  }

  function choose(key) {
    setPlaying(false)
    setStarted(true)
    setSelected(key)
  }

  let passedUntil = 0
  if (started) {
    passedUntil = stepPosition(selected)
  }
  const chosen = pipelineSteps[stepPosition(selected)]
  const position = stepPosition(selected)

  return (
    <div>
      <div className="page-head">
        <h1>The end-to-end pipeline</h1>
        <p>Every answer goes through the same steps, from a photographed or typed answer to the teacher's decision. Press play for a guided tour, click any step to read about it, or send a real answer through the grader below.</p>
      </div>
      <div className="player-bar card">
        <div className="row">
          <button className="button primary" onClick={togglePlay}>{playing ? <Pause size={16} /> : <Play size={16} />}{playing ? "Pause the tour" : started ? "Continue the tour" : "Play the tour"}</button>
          <button className="button secondary" onClick={reset}><RotateCcw size={16} />Restart</button>
          <span className="player-count">Step {position + 1} of {pipelineSteps.length}</span>
        </div>
        <StageProgress selected={selected} started={started} />
      </div>
      <div className="grid-pipeline">
        <PipelineDiagram selected={selected} onSelect={choose} passedUntil={passedUntil} playing={playing} />
        <StepDetail step={chosen} />
      </div>
      <LiveRun examples={examples} status={status} />
      <div className="card one-sentence">
        <div className="card-title"><h2>In one sentence</h2></div>
        <p>A fine-tuned cross-encoder measures how close the answer's meaning is to the reference, a local LLM checks every rubric point and must quote the student's own words, the two scores are calibrated and averaged, their agreement becomes the confidence, and anything uncertain or suspicious goes to a teacher, who makes the final decision.</p>
      </div>
    </div>
  )
}
