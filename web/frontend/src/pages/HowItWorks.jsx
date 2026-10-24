import { PipelineDiagram } from "../components/Pipeline.jsx"

export default function HowItWorks() {
  return (
    <div>
      <div className="page-head">
        <h1>How it works: the grading pipeline</h1>
        <p>Every answer goes through the same steps, from a scanned or typed answer to the teacher's decision. Click any step to see what it does, why it is there, what we measured, and where it is in the code.</p>
      </div>
      <PipelineDiagram />
      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-title"><h2>In one sentence</h2></div>
        <p>A fine-tuned cross-encoder measures how close the answer's meaning is to the reference, a local LLM checks every rubric point and must quote the student's own words, the two scores are calibrated and averaged, their agreement becomes the confidence, and anything uncertain or suspicious goes to a teacher, who makes the final decision.</p>
      </div>
    </div>
  )
}
