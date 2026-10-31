import { useEffect, useState } from "react"
import { Boxes, Brain, Cpu, Database, FlaskConical, Globe, Monitor, ScanText, Server } from "lucide-react"
import { getJson } from "../api.js"

const layers = [
  { key: "nlp", name: "NLP models", colour: "#2a78d6", icon: Brain, about: "The two models that read the answer, and the maths that turns their scores into a mark and a confidence." },
  { key: "service", name: "Grading service", colour: "#7c5cd6", icon: Server, about: "The reusable asset: a Python module with a REST API that any application can call." },
  { key: "group1", name: "Group 1 integration", colour: "#eb6834", icon: ScanText, about: "Reading photographed, handwritten answer sheets with Group 1's Handwritten Exam Digitizer." },
  { key: "web", name: "Web application", colour: "#1baf7a", icon: Monitor, about: "The teacher's app: a Django backend with a database and a React interface." },
  { key: "data", name: "Data and evaluation", colour: "#d39b1b", icon: FlaskConical, about: "How we measured the grader honestly, week by week." },
  { key: "tools", name: "Testing and tools", colour: "#5f6b7a", icon: Boxes, about: "Keeping the project working and shareable." },
]

const tools = [
  { name: "PyTorch", layer: "nlp", version: "torch", role: "Runs the fine-tuned TinyBERT cross-encoder.", why: "The standard deep-learning library for Transformer models; it also used the Apple GPU (MPS) for fine-tuning in the notebooks.", where: "src/grader.py → similarity_score()" },
  { name: "Hugging Face Transformers", layer: "nlp", version: "transformers", role: "Loads the tokenizer and the cross-encoder (cross-encoder/stsb-TinyBERT-L4, fine-tuned on the teachers' marks).", why: "Gives ready-made pretrained models, so we only had to fine-tune, not train from scratch.", where: "src/grader.py (top of the file); models/cross encoder" },
  { name: "Ollama", layer: "nlp", version: "ollama", role: "Runs the LLM on this computer and answers over HTTP on port 11434.", why: "Keeps every student answer on the local machine and needs no paid API.", where: "src/grader.py → ask_llm(), llm_is_available()" },
  { name: "Qwen 2.5 7B Instruct", layer: "nlp", version: "", fixed: "7B", role: "The LLM that checks each rubric point and must quote the student's words as evidence.", why: "Strong at following a JSON format and runs in 16 GB of memory; temperature 0 and a fixed seed make marks repeatable.", where: "models/settings.json → llm_model" },
  { name: "scikit-learn", layer: "nlp", version: "scikit-learn", role: "Fitted the isotonic calibration curve and the logistic confidence model in the notebooks.", why: "Isotonic regression fixes the LLM's harsh scale without changing its ranking; logistic regression turns model disagreement into a probability.", where: "models/calibration.json, models/confidence.json" },
  { name: "NumPy", layer: "nlp", version: "numpy", role: "Applies the saved calibration points and the confidence formula at grading time.", why: "Fast and simple maths on arrays; no need to load scikit-learn in the service.", where: "src/grader.py → calibrate(), confidence_from_gaps()" },
  { name: "FastAPI", layer: "service", version: "fastapi", role: "The REST API with six endpoints and interactive documentation at /docs.", why: "Writes the documentation from the code and checks every request automatically.", where: "src/api.py" },
  { name: "Uvicorn", layer: "service", version: "uvicorn", role: "The web server that runs the FastAPI app on port 8000.", why: "The standard, lightweight server for FastAPI.", where: "launcher.py → start_all()" },
  { name: "Pydantic", layer: "service", version: "pydantic", role: "Describes and validates the JSON going in and out (AnswerRequest, GradeResult, Group1Page…).", why: "A wrong or missing field gives a clear error (422) instead of a crash.", where: "src/api.py (the classes at the top)" },
  { name: "Requests", layer: "service", version: "requests", role: "Sends HTTP requests: the grader to Ollama, and Django to the grading API.", why: "The simplest HTTP client for Python.", where: "src/grader.py → ask_llm(); web/backend/grading/views.py → call_grading_service()" },
  { name: "Python", layer: "service", version: "python", role: "The language of the grader, the API, the web backend and the notebooks.", why: "Every NLP library we needed is written for Python.", where: "Everything in src/, web/backend/ and notebooks/" },
  { name: "Tesseract OCR", layer: "group1", version: "tesseract", role: "The OCR engine that Group 1's digitizer uses to read handwriting.", why: "Free, offline, and what Group 1 built their asset on.", where: "src/group1.py → digitizer_available()" },
  { name: "pytesseract", layer: "group1", version: "pytesseract", role: "Lets Python call Tesseract.", why: "Needed by Group 1's digitize_page().", where: "Group 1 digitizer/src/ocr_pipeline.py" },
  { name: "Group 1's digitizer", layer: "group1", version: "", fixed: "their asset", role: "Cleans the photo (OpenCV), reads it (Tesseract), finds the student ID and question (spaCy NER) and fixes spelling.", why: "Integration with another AI University component, as the handout asks; we use it unchanged.", where: "src/group1.py → digitize(), pages_to_answers()" },
  { name: "jiwer", layer: "group1", version: "jiwer", role: "Measures the character error rate (CER) of the OCR.", why: "Lets us copy Group 1's real error rates (CER 0.04 to 0.34) in the Week 7 experiment.", where: "notebooks/Group 2 AI Exam Grader Week 7.ipynb" },
  { name: "Django", layer: "web", version: "django", role: "The web backend on port 8001: saves graded answers and teacher decisions, runs the review queue and serves this app.", why: "Comes with a database layer, an admin site and protection against cross-site requests.", where: "web/backend/grading/views.py, models.py" },
  { name: "SQLite", layer: "web", version: "", fixed: "built in", role: "The database file that stores every graded answer and teacher decision.", why: "Built into Python: no database server to install.", where: "web/backend/db.sqlite3; models.py → GradedAnswer" },
  { name: "WhiteNoise", layer: "web", version: "whitenoise", role: "Serves the built React files from Django.", why: "One server for the app and its files; no separate web server.", where: "web/backend/gradersite/settings.py" },
  { name: "React", layer: "web", version: "react", role: "The teacher interface you are using now.", why: "Builds the screens from small components that update when the data changes.", where: "web/frontend/src" },
  { name: "Vite", layer: "web", version: "vite", role: "Builds the React code into the files in web/frontend/dist.", why: "Fast builds and a live-reload server while developing.", where: "web/frontend/vite.config.js" },
  { name: "Recharts", layer: "web", version: "recharts", role: "Draws the charts: score waterfall, confidence curve, benchmark.", why: "Charts made from React components, with animation built in.", where: "web/frontend/src/components/charts.jsx" },
  { name: "highlight.js", layer: "web", version: "highlight.js", role: "Colours the source code in the Code explorer.", why: "Small and supports Python, JavaScript, JSON and scripts.", where: "web/frontend/src/pages/CodeExplorer.jsx" },
  { name: "Lucide icons", layer: "web", version: "lucide-react", role: "The icons in this app.", why: "Clean, consistent icons as React components.", where: "web/frontend/src/App.jsx" },
  { name: "pandas", layer: "data", version: "pandas", role: "Loads the Mohler dataset and builds the result tables.", why: "The standard tool for tables of data in Python.", where: "notebooks/" },
  { name: "Matplotlib and Plotly", layer: "data", version: "matplotlib", role: "Draw the charts in the weekly reports.", why: "Matplotlib for report figures, Plotly for the earlier interactive demo.", where: "results/charts" },
  { name: "Jupyter notebooks", layer: "data", version: "", fixed: "VS Code", role: "Where every experiment from Week 1 to Week 7 was run.", why: "Code, results and explanations side by side, easy to re-run.", where: "notebooks/" },
  { name: "pytest", layer: "tools", version: "pytest", role: "Runs 24 automated tests for the grader, the Group 1 adapter and the API (plus 12 Django tests for the web app).", why: "Checks that every change keeps the grader working, without needing the LLM.", where: "tests/" },
  { name: "Git and GitHub", layer: "tools", version: "", fixed: "public repo", role: "Version control and the public repository.", why: "Every change is recorded; anyone can download and run the project.", where: "github.com/RitwikShetty05/ai-exam-answer-grader" },
]

function layerOf(key) {
  for (const layer of layers) {
    if (layer.key === key) {
      return layer
    }
  }
  return layers[0]
}

function versionText(tool, versions) {
  if (tool.fixed) {
    return tool.fixed
  }
  if (!versions) {
    return "…"
  }
  const version = versions[tool.version]
  if (version) {
    return "v" + version
  }
  return "not found"
}

function Flow({ status }) {
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
  const nodes = [
    { title: "Browser", sub: "React app", port: "", on: true, icon: Globe },
    { title: "Django", sub: "web app + SQLite", port: ":8001", on: true, icon: Database },
    { title: "FastAPI", sub: "grading API + TinyBERT", port: ":8000", on: apiOn, icon: Server },
    { title: "Ollama", sub: "Qwen 2.5 7B", port: ":11434", on: llmOn, icon: Cpu },
  ]
  return (
    <div className="card flow-card">
      <div className="card-title"><h2>How the parts talk to each other</h2><p>Live status from this computer</p></div>
      <div className="flow">
        {nodes.map((node, position) => {
          const Icon = node.icon
          return (
            <div key={node.title} className="flow-item" style={{ "--i": position }}>
              <div className={"flow-node" + (node.on ? " on" : " off")}>
                <Icon size={22} />
                <strong>{node.title}</strong>
                <span>{node.sub}</span>
                {node.port && <code>{node.port}</code>}
                <i className="flow-status" />
              </div>
              {position < nodes.length - 1 && <div className="flow-link"><span /><span /><span /></div>}
            </div>
          )
        })}
      </div>
      <div className="flow-branch">
        <div className="flow-branch-line" />
        <div className={"flow-node small" + (digitizerOn ? " on" : " off")}>
          <ScanText size={18} />
          <strong>Group 1 digitizer</strong>
          <span>OpenCV · Tesseract · spaCy, called by FastAPI</span>
          <i className="flow-status" />
        </div>
      </div>
      <p className="hint" style={{ marginTop: 12 }}>The browser only talks to Django. Django saves every result and asks the grading API for marks; the grading API runs the similarity model itself and asks Ollama for the LLM's rubric check. Nothing leaves this computer.</p>
    </div>
  )
}

export default function TechStack({ status }) {
  const [filter, setFilter] = useState("all")
  const [versions, setVersions] = useState(null)

  useEffect(() => {
    async function load() {
      try {
        const reply = await getJson("/api/stack")
        setVersions(reply.versions)
      } catch {
        setVersions({})
      }
    }
    load()
  }, [])

  const shown = []
  for (const tool of tools) {
    if (filter === "all" || tool.layer === filter) {
      shown.push(tool)
    }
  }
  let installed = 0
  if (versions) {
    for (const tool of tools) {
      if (tool.fixed || versions[tool.version]) {
        installed = installed + 1
      }
    }
  }

  return (
    <div>
      <div className="page-head">
        <h1>Tech stack</h1>
        <p>Every library, model and tool the project uses, what it does, why we chose it and where it is in the code. Version numbers are read live from this computer.</p>
      </div>
      <div className="stack-stats">
        <div className="stack-stat"><strong>{tools.length}</strong><span>tools</span></div>
        <div className="stack-stat"><strong>{layers.length}</strong><span>layers</span></div>
        <div className="stack-stat"><strong>{versions ? installed : "…"}</strong><span>found on this computer</span></div>
        <div className="stack-stat"><strong>0</strong><span>paid or cloud services</span></div>
      </div>
      <Flow status={status} />
      <div className="chips">
        <button className={"chip" + (filter === "all" ? " active" : "")} onClick={() => setFilter("all")}>All <span>{tools.length}</span></button>
        {layers.map((layer) => {
          const Icon = layer.icon
          let count = 0
          for (const tool of tools) {
            if (tool.layer === layer.key) {
              count = count + 1
            }
          }
          return (
            <button key={layer.key} className={"chip" + (filter === layer.key ? " active" : "")} style={{ "--chip": layer.colour }} onClick={() => setFilter(layer.key)}>
              <Icon size={15} />{layer.name} <span>{count}</span>
            </button>
          )
        })}
      </div>
      {filter !== "all" && <p className="layer-about">{layerOf(filter).about}</p>}
      <div key={filter} className="tool-grid">
        {shown.map((tool, position) => {
          const layer = layerOf(tool.layer)
          const Icon = layer.icon
          const version = versionText(tool, versions)
          return (
            <div key={tool.name} className="tool-card" style={{ "--i": position, "--tool": layer.colour }}>
              <div className="tool-head">
                <span className="tool-icon"><Icon size={18} /></span>
                <div>
                  <h3>{tool.name}</h3>
                  <span className="tool-layer">{layer.name}</span>
                </div>
                <span className={"tool-version" + (version === "not found" ? " missing" : "")}>{version}</span>
              </div>
              <p className="tool-role">{tool.role}</p>
              <p className="tool-why"><b>Why:</b> {tool.why}</p>
              <code className="tool-where">{tool.where}</code>
            </div>
          )
        })}
      </div>
    </div>
  )
}
