import { useEffect, useRef, useState } from "react"
import hljs from "highlight.js/lib/core"
import python from "highlight.js/lib/languages/python"
import javascript from "highlight.js/lib/languages/javascript"
import xml from "highlight.js/lib/languages/xml"
import json from "highlight.js/lib/languages/json"
import bash from "highlight.js/lib/languages/bash"
import dos from "highlight.js/lib/languages/dos"
import { BookOpen, Copy, Eye, EyeOff, FileCode, Search, Sparkles } from "lucide-react"
import { getJson } from "../api.js"
import { Skeleton, showToast } from "../components/ui.jsx"

hljs.registerLanguage("python", python)
hljs.registerLanguage("javascript", javascript)
hljs.registerLanguage("xml", xml)
hljs.registerLanguage("json", json)
hljs.registerLanguage("bash", bash)
hljs.registerLanguage("dos", dos)

const languageNames = { python: "Python", javascript: "React (JSX)", json: "JSON", bash: "Shell script (Mac)", dos: "Batch file (Windows)" }

function definitionName(line, language) {
  let match = null
  if (language === "python") {
    match = line.match(/^(?:async\s+)?def\s+([A-Za-z_]\w*)|^class\s+([A-Za-z_]\w*)/)
  } else if (language === "javascript") {
    match = line.match(/^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/)
  }
  if (!match) {
    return null
  }
  return match[1] || match[2]
}

function splitIntoBlocks(content, language) {
  const lines = content.replace(/\n$/, "").split("\n")
  const starts = []
  for (let index = 0; index < lines.length; index++) {
    const name = definitionName(lines[index], language)
    if (name) {
      let begin = index
      while (begin > 0 && lines[begin - 1].startsWith("@")) {
        begin = begin - 1
      }
      starts.push({ begin: begin, name: name, kind: lines[index].trim().startsWith("class") ? "class" : "function" })
    }
  }
  const blocks = []
  let firstLine = 0
  if (starts.length > 0) {
    firstLine = starts[0].begin
  } else {
    firstLine = lines.length
  }
  if (firstLine > 0) {
    blocks.push({ name: "", kind: "top", start: 0, lines: lines.slice(0, firstLine) })
  }
  for (let position = 0; position < starts.length; position++) {
    let end = lines.length
    if (position + 1 < starts.length) {
      end = starts[position + 1].begin
    }
    blocks.push({ name: starts[position].name, kind: starts[position].kind, start: starts[position].begin, lines: lines.slice(starts[position].begin, end) })
  }
  return blocks
}

function humanise(name) {
  return name.replace(/^test_/, "").split("_").join(" ")
}

function explanationFor(block, explanations) {
  if (block.kind === "top") {
    return explanations["(top)"] || ""
  }
  if (explanations[block.name]) {
    return explanations[block.name]
  }
  if (block.name.startsWith("test_")) {
    return "Automated test: checks that " + humanise(block.name) + "."
  }
  return ""
}

function highlight(text, language) {
  if (!hljs.getLanguage(language)) {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;")
  }
  return hljs.highlight(text, { language: language, ignoreIllegals: true }).value
}

function CodeBlock({ block, language, explanation, showNotes, flash }) {
  const numbers = []
  for (let index = 0; index < block.lines.length; index++) {
    numbers.push(block.start + index + 1)
  }
  let label = "Top of the file"
  if (block.kind === "class") {
    label = "class " + block.name
  } else if (block.kind === "function") {
    label = block.name + "()"
  }
  return (
    <div id={"block-" + block.start} className={"code-block" + (flash ? " flash" : "")}>
      {showNotes && explanation && (
        <div className="code-note">
          <Sparkles size={15} />
          <div>
            <span className="code-note-name">{label}</span>
            <p>{explanation}</p>
          </div>
        </div>
      )}
      <div className="code-lines">
        <pre className="code-gutter">{numbers.join("\n")}</pre>
        <pre className="code-text hljs"><code dangerouslySetInnerHTML={{ __html: highlight(block.lines.join("\n"), language) }} /></pre>
      </div>
    </div>
  )
}

export default function CodeExplorer() {
  const [groups, setGroups] = useState(null)
  const [selected, setSelected] = useState("src/grader.py")
  const [files, setFiles] = useState({})
  const [search, setSearch] = useState("")
  const [showNotes, setShowNotes] = useState(true)
  const [flashed, setFlashed] = useState(null)
  const [error, setError] = useState("")
  const viewerRef = useRef(null)

  useEffect(() => {
    async function load() {
      try {
        const reply = await getJson("/api/code")
        setGroups(reply.groups)
      } catch (problem) {
        setError(problem.message)
      }
    }
    load()
  }, [])

  useEffect(() => {
    if (files[selected]) {
      return
    }
    async function loadFile() {
      try {
        const reply = await getJson("/api/code/file?path=" + encodeURIComponent(selected))
        setFiles((saved) => ({ ...saved, [selected]: reply }))
      } catch (problem) {
        setFiles((saved) => ({ ...saved, [selected]: { error: problem.message } }))
      }
    }
    loadFile()
  }, [selected, files])

  function openFile(path) {
    setSelected(path)
    setFlashed(null)
    if (viewerRef.current) {
      viewerRef.current.scrollIntoView({ behavior: "smooth", block: "start" })
    }
  }

  function jumpTo(block) {
    const element = document.getElementById("block-" + block.start)
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" })
    }
    setFlashed(block.start)
    setTimeout(() => setFlashed(null), 1600)
  }

  async function copyCode(file) {
    try {
      await navigator.clipboard.writeText(file.content)
      showToast("Code copied to the clipboard", "good")
    } catch {
      showToast("The browser did not allow copying", "bad")
    }
  }

  if (error) {
    return <div className="banner bad">✗ {error}</div>
  }
  if (!groups) {
    return <Skeleton blocks={[420]} />
  }

  const lowered = search.trim().toLowerCase()
  const file = files[selected]
  let blocks = []
  if (file && file.content !== undefined) {
    blocks = splitIntoBlocks(file.content, file.language)
  }
  let explained = 0
  for (const block of blocks) {
    if (block.kind !== "top" && file && explanationFor(block, file.explanations)) {
      explained = explained + 1
    }
  }

  return (
    <div>
      <div className="page-head">
        <h1>Code explorer</h1>
        <p>Read the project's own source code with an explanation in simple words before every function. Pick a file on the left; click a name in the outline to jump to it.</p>
      </div>
      <div className="code-layout">
        <aside className="file-panel card">
          <div className="search-box">
            <Search size={15} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find a file" />
          </div>
          {groups.map((group) => {
            const matching = group.files.filter((item) => lowered === "" || item.title.toLowerCase().indexOf(lowered) >= 0 || item.path.toLowerCase().indexOf(lowered) >= 0)
            if (matching.length === 0) {
              return null
            }
            return (
              <div key={group.name} className="file-group">
                <div className="file-group-name">{group.name}</div>
                {matching.map((item) => (
                  <button key={item.path} className={"file-item" + (item.path === selected ? " active" : "")} onClick={() => openFile(item.path)} disabled={!item.available}>
                    <FileCode size={15} />
                    <span className="file-item-text">
                      <span className="file-item-title">{item.title}</span>
                      <span className="file-item-path">{item.path} · {item.lines} lines</span>
                    </span>
                  </button>
                ))}
              </div>
            )
          })}
        </aside>
        <section className="code-viewer" ref={viewerRef}>
          {!file && <Skeleton blocks={[120, 360]} />}
          {file && file.error && <div className="banner bad">✗ {file.error}</div>}
          {file && file.content !== undefined && (
            <div key={selected} className="code-swap">
              <div className="card code-header">
                <div className="code-header-top">
                  <div>
                    <span className="language-badge">{languageNames[file.language] || file.language}</span>
                    <h2>{file.title}</h2>
                    <code className="code-path">{file.path}</code>
                  </div>
                  <div className="row">
                    <button className="button secondary small" onClick={() => setShowNotes(!showNotes)}>{showNotes ? <EyeOff size={15} /> : <Eye size={15} />}{showNotes ? "Hide explanations" : "Show explanations"}</button>
                    <button className="button secondary small" onClick={() => copyCode(file)}><Copy size={15} />Copy code</button>
                  </div>
                </div>
                <div className="code-summary">
                  <BookOpen size={17} />
                  <p>{file.summary}</p>
                </div>
                {file.points && file.points.length > 0 && (
                  <ul className="code-points">
                    {file.points.map((point) => <li key={point}>{point}</li>)}
                  </ul>
                )}
                <div className="code-stats">
                  <span><b>{file.content.split("\n").length}</b> lines</span>
                  <span><b>{blocks.filter((block) => block.kind !== "top").length}</b> functions and classes</span>
                  <span><b>{explained}</b> explained</span>
                </div>
                {blocks.filter((block) => block.kind !== "top").length > 0 && (
                  <div className="outline">
                    {blocks.filter((block) => block.kind !== "top").map((block) => (
                      <button key={block.start} className="outline-chip" onClick={() => jumpTo(block)}>{block.kind === "class" ? "class " : ""}{block.name}</button>
                    ))}
                  </div>
                )}
              </div>
              <div className="code-body">
                {blocks.map((block) => (
                  <CodeBlock key={block.start} block={block} language={file.language} explanation={explanationFor(block, file.explanations)} showNotes={showNotes} flash={flashed === block.start} />
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
