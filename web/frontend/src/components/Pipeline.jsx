import { useState } from "react"

export const pipelineSteps = [
  {
    key: "scan",
    stage: "Input",
    title: "Scanned page",
    short: "Group 1's digitize_page()",
    kind: "group1",
    what: "Group 1's Handwritten Exam Digitizer cleans the photo, reads it with Tesseract OCR and finds the student ID, question number and marks with rule-based NER. It returns one record per page with an OCR confidence.",
    why: "Real exams are handwritten. Their asset turns a photo into text our grader can mark.",
    code: "src/group1.py → digitize() calls Group 1's digitizer.py → digitize_page()",
    number: "≈1 second per page; OCR errors 4% (neat) to 35% (cursive) of characters",
  },
  {
    key: "typed",
    stage: "Input",
    title: "Typed answer",
    short: "Teacher form or JSON sheet",
    kind: "input",
    what: "A question, the teacher's reference answer, an optional rubric, the student's answer and the maximum marks, from this app or from any program through the API.",
    why: "The grader needs a reference answer for every question; the rubric is optional.",
    code: "src/api.py → POST /evaluate-answer, POST /evaluate-batch",
    number: "Mohler data: 2,264 answers to 79 questions",
  },
  {
    key: "adapter",
    stage: "Pre-processing",
    title: "Group 1 adapter",
    short: "Header out, question found, pages joined",
    kind: "group1",
    what: "Removes the name and roll-number header, finds the question number even when the OCR misreads it (\"QL\", \"@1]\" → Q1), splits a page that holds two questions, joins an answer that continues on the next page, and keeps the lowest OCR confidence.",
    why: "Group 1's real output is one record per page, not one per answer, and the student ID is often unreadable.",
    code: "src/group1.py → pages_to_answers(), split_into_questions(), question_label()",
    number: "Tested on Group 1's 2 real pages and in 6 automated tests",
  },
  {
    key: "checks",
    stage: "Pre-processing",
    title: "Safety checks",
    short: "Blank, injection, OCR, long answer",
    kind: "check",
    what: "A blank answer gets 0 straight away. Instruction-like text (\"ignore previous instructions\"), OCR confidence below 0.80 and answers over 100 words are flagged for a teacher. Tags typed by the student are neutralised.",
    why: "Some answers should never be marked automatically, and an answer must not be able to give orders to the LLM.",
    code: "src/grader.py → is_blank_answer(), looks_like_injection(), make_safe_answer(), evaluate_answer()",
    number: "Pattern check flags 40 of 50 injection attacks, 0 false alarms on 2,264 real answers",
  },
  {
    key: "rubric",
    stage: "Pre-processing",
    title: "Rubric",
    short: "Teacher's, saved or generated",
    kind: "check",
    what: "Uses the teacher's rubric if given; otherwise a saved one, or the LLM breaks the reference answer into 1–5 key points, saved so a teacher can check them.",
    why: "Checking point by point makes the mark explainable and harder to fool than one overall score.",
    code: "src/grader.py → get_rubric(), make_rubric()",
    number: "77 rubrics saved in models/rubric cache.json",
  },
  {
    key: "b3",
    stage: "NLP models",
    title: "B3 · similarity model",
    short: "Fine-tuned TinyBERT cross-encoder",
    kind: "model",
    what: "Reads the reference answer and the student answer together and predicts a mark from 0 to 5. It was fine-tuned on the teachers' marks.",
    why: "Recognises the same meaning in different words, which word matching (TF-IDF) cannot.",
    code: "src/grader.py → similarity_score(); model in models/cross encoder",
    number: "MAE 0.634 on all answers (TF-IDF baseline 0.724)",
  },
  {
    key: "b2",
    stage: "NLP models",
    title: "B2 · local LLM check",
    short: "Qwen 2.5 7B with quoted evidence",
    kind: "model",
    what: "For each rubric point the LLM says present, partial or missing and must quote the student's own words; our code rejects quotes that are not in the answer, computes the rubric score itself, and takes half a point off per wrong statement.",
    why: "Judges correctness: catches wrong answers that use the right words, which fool the similarity model.",
    code: "src/grader.py → llm_grade(), ask_llm(), evidence_is_real(), match_checks_to_rubric()",
    number: "Raw LLM ranks well (r 0.66) but is too strict (MAE 1.37) until calibrated",
  },
  {
    key: "calibrate",
    stage: "Post-processing",
    title: "Calibration",
    short: "LLM → teachers' scale",
    kind: "process",
    what: "Maps the average of the LLM's score and the rubric score to the teachers' scale with isotonic regression (a curve that only goes up).",
    why: "The LLM marks far more strictly than the teachers; calibration fixes the scale, not the ranking.",
    code: "src/grader.py → calibrate(); points in models/calibration.json",
    number: "Calibrated B2: MAE 0.553, the lowest of any single model",
  },
  {
    key: "final",
    stage: "Post-processing",
    title: "Final mark",
    short: "Average of B3 and B2",
    kind: "process",
    what: "Averages the similarity model and the calibrated LLM score, scales to the maximum marks and rounds to 0.5.",
    why: "The two models make different mistakes, so the average is more accurate and more stable than either.",
    code: "src/grader.py → evaluate_answer(), scale_score()",
    number: "MAE 0.572, within ±1 mark 82%, r 0.71; significantly better than B3 alone",
  },
  {
    key: "confidence",
    stage: "Trust",
    title: "Confidence",
    short: "Do the two models agree?",
    kind: "trust",
    what: "A logistic regression turns the disagreement between B3 and B2 (and between the LLM and the rubric) into the chance that the mark is within ±1 mark of a teacher's.",
    why: "A teacher needs to know which marks to double-check.",
    code: "src/grader.py → confidence_from_gaps(); model in models/confidence.json",
    number: "Confidence ≥ 0.85 was right 87% of the time; below 0.50 only 27%",
  },
  {
    key: "routing",
    stage: "Trust",
    title: "Review routing",
    short: "Marked automatically or sent to a teacher",
    kind: "trust",
    what: "Sends an answer to a teacher if confidence is below 0.60, the LLM and rubric scores differ by 2 or more, or any safety check fired.",
    why: "Keeps a human in the loop exactly where the grader is unsure.",
    code: "src/grader.py → evaluate_answer() (review_reasons)",
    number: "18.8% of answers sent to a teacher; they hold 45.7% of the large errors",
  },
  {
    key: "teacher",
    stage: "Teacher",
    title: "Teacher decides",
    short: "Review queue, final mark, CSV",
    kind: "teacher",
    what: "Every recommendation is saved; flagged answers wait in the review queue, and the teacher's mark and comment are stored as the final mark.",
    why: "The grader only recommends. The teacher always makes the final decision.",
    code: "web/backend/grading → views.py (review_answer), models.py (GradedAnswer); web/frontend → Review queue page",
    number: "Every decision stored with a comment and time; export as CSV",
  },
]

const kindColours = {
  input: { background: "#f4f6f9", border: "#c9ccd3", label: "#4a4e57" },
  group1: { background: "#fff4e8", border: "#eb6834", label: "#a8461f" },
  check: { background: "#f4f8fd", border: "#8fb4e6", label: "#1c5cab" },
  model: { background: "#e8f1fc", border: "#2a78d6", label: "#1c5cab" },
  process: { background: "#eef5ff", border: "#5b97df", label: "#1c5cab" },
  trust: { background: "#e9f7ef", border: "#1baf7a", label: "#127a55" },
  teacher: { background: "#0f1b2d", border: "#0f1b2d", label: "#7fb2ee" },
}

const stageOrder = ["Input", "Pre-processing", "NLP models", "Post-processing", "Trust", "Teacher"]

function StepBox({ step, selected, onSelect }) {
  const colours = kindColours[step.kind]
  let textColour = "var(--ink)"
  let subColour = "var(--ink-soft)"
  if (step.kind === "teacher") {
    textColour = "#ffffff"
    subColour = "#c9d4e3"
  }
  return (
    <button
      className={"pipe-step" + (selected ? " selected" : "")}
      style={{ background: colours.background, borderColor: colours.border }}
      onClick={() => onSelect(step.key)}
    >
      <span className="pipe-title" style={{ color: textColour }}>{step.title}</span>
      <span className="pipe-short" style={{ color: subColour }}>{step.short}</span>
    </button>
  )
}

export function PipelineDiagram() {
  const [selected, setSelected] = useState("b2")
  let chosen = pipelineSteps[0]
  for (const step of pipelineSteps) {
    if (step.key === selected) {
      chosen = step
    }
  }
  return (
    <div className="grid-pipeline">
      <div className="pipe-board">
        {stageOrder.map((stage, position) => (
          <div key={stage}>
            <div className="pipe-row">
              <div className="pipe-stage">{stage}</div>
              <div className={"pipe-steps" + (stage === "NLP models" ? " parallel" : "")}>
                {pipelineSteps.filter((step) => step.stage === stage).map((step, index, list) => (
                  <div key={step.key} className="pipe-cell">
                    <StepBox step={step} selected={selected === step.key} onSelect={setSelected} />
                    {stage !== "NLP models" && stage !== "Input" && index < list.length - 1 && <span className="pipe-arrow-right">→</span>}
                  </div>
                ))}
              </div>
            </div>
            {position < stageOrder.length - 1 && <div className="pipe-arrow-down">↓</div>}
          </div>
        ))}
        <div className="legend" style={{ marginTop: 14 }}>
          <span><i style={{ background: "#eb6834" }} />Group 1 integration (Week 7)</span>
          <span><i style={{ background: "#2a78d6" }} />NLP models and processing</span>
          <span><i style={{ background: "#1baf7a" }} />Trust and review</span>
          <span><i style={{ background: "#0f1b2d" }} />Teacher</span>
        </div>
      </div>
      <div className="card pipe-detail">
        <p className="metric-label">{chosen.stage}</p>
        <h2 style={{ marginTop: 4 }}>{chosen.title}</h2>
        <div className="section-label">What it does</div>
        <p>{chosen.what}</p>
        <div className="section-label">Why</div>
        <p>{chosen.why}</p>
        <div className="section-label">Measured</div>
        <p>{chosen.number}</p>
        <div className="section-label">Where in the code</div>
        <p><code>{chosen.code}</code></p>
        <p className="hint" style={{ marginTop: 14 }}>Click any step in the diagram to see its details.</p>
      </div>
    </div>
  )
}

function round(value) {
  return Math.round(value * 100) / 100
}

export function AnswerPipeline({ result }) {
  const scores = result.scores_out_of_5 || {}
  const reasons = result.review_reasons || []
  const items = []
  let checksText = "No problems found"
  if (result.grading_mode === "blank_answer") {
    checksText = "Blank answer → 0, models skipped"
  } else if (reasons.length > 0) {
    const found = []
    for (const reason of reasons) {
      const lowered = reason.toLowerCase()
      if (lowered.indexOf("ocr") >= 0 && found.indexOf("low OCR confidence") < 0) {
        found.push("low OCR confidence")
      }
      if (lowered.indexOf("instruction") >= 0) {
        found.push("instruction-like text")
      }
      if (lowered.indexOf("long answer") >= 0) {
        found.push("long answer")
      }
      if (lowered.indexOf("student id") >= 0) {
        found.push("student ID missing")
      }
    }
    if (found.length > 0) {
      checksText = found.join(", ")
    }
  }
  items.push({ title: "Checks", value: checksText, kind: "check" })
  if (result.removed_header) {
    items.unshift({ title: "Group 1 adapter", value: "header removed · pages " + (result.pages || []).join(", "), kind: "group1" })
  }
  if (scores.similarity_model !== undefined) {
    items.push({ title: "B3 similarity", value: round(scores.similarity_model) + " / 5", kind: "model" })
  }
  if (scores.llm !== undefined) {
    let penalty = ""
    if (scores.wrong_statement_penalty !== undefined && scores.wrong_statement_penalty !== 0) {
      penalty = " (" + round(scores.wrong_statement_penalty) + " penalty)"
    }
    items.push({ title: "B2 LLM + rubric", value: "LLM " + scores.llm + " · rubric " + scores.rubric + penalty, kind: "model" })
    items.push({ title: "Calibrated", value: round(scores.llm_calibrated) + " / 5", kind: "process" })
  }
  if (result.grading_mode === "similarity_only") {
    items.push({ title: "B2 LLM", value: "not available — similarity only", kind: "model" })
  }
  items.push({ title: "Final mark", value: result.score + " / " + result.maximum_score, kind: "process" })
  items.push({ title: "Confidence", value: Math.round(result.confidence * 100) + "%", kind: "trust" })
  if (result.needs_human_review) {
    items.push({ title: "Decision", value: "Sent to a teacher (" + reasons.length + " reason" + (reasons.length === 1 ? "" : "s") + ")", kind: "teacher" })
  } else {
    items.push({ title: "Decision", value: "Marked automatically", kind: "trust" })
  }
  return (
    <div className="answer-pipe">
      {items.map((item, position) => (
        <div key={item.title} className="answer-pipe-cell">
          <div className="answer-pipe-step" style={{ background: kindColours[item.kind].background, borderColor: kindColours[item.kind].border }}>
            <span className="answer-pipe-title" style={{ color: item.kind === "teacher" ? "#7fb2ee" : kindColours[item.kind].label }}>{item.title}</span>
            <span className="answer-pipe-value" style={{ color: item.kind === "teacher" ? "#ffffff" : "var(--ink)" }}>{item.value}</span>
          </div>
          {position < items.length - 1 && <span className="answer-pipe-arrow">→</span>}
        </div>
      ))}
    </div>
  )
}
