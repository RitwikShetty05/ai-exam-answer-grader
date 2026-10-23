const endpoints = [
  ["GET", "/health", "Is the service ready? Shows whether the LLM and Group 1's digitizer are available"],
  ["POST", "/generate-rubric", "Makes rubric key points from a reference answer for a teacher to check"],
  ["POST", "/evaluate-answer", "Grades one answer: mark, feedback, confidence and review flags"],
  ["POST", "/evaluate-batch", "Grades a list of answers in the course handout's Group 1 format"],
  ["POST", "/digitize", "New in Week 7: reads one scanned page with Group 1's digitize_page()"],
  ["POST", "/evaluate-group1-pages", "New in Week 7: grades Group 1's page records exactly as their digitizer returns them"],
]

const exampleRequest = {
  answer_key: {
    Q1: {
      question_text: "Explain the OSI model and how an email is sent and received through its layers.",
      reference_answer: "The OSI model has seven layers ...",
      maximum_marks: 10,
      rubric: ["Application layer: email programs use SMTP to send and IMAP or POP3 to receive emails.", "..."],
    },
  },
  pages: [
    { student_id: null, question: "Q1", answer_text: "ISP Assignment % - Eool hayush Nayak\nQL OS! Model in Email Sending and Recening ...", page: 1, ocr_confidence: 0.82 },
  ],
  student_id: "E007",
}

export default function UseApi({ status }) {
  let apiAddress = "http://localhost:8000"
  if (status && status.grading_api_url) {
    apiAddress = status.grading_api_url
  }
  const python = 'import requests\nfrom digitizer import digitize_page\n\npage = digitize_page("answer sheet page 1.jpg", page_number=1)\nreply = requests.post("' + apiAddress + '/evaluate-group1-pages", json={"answer_key": answer_key, "pages": [page], "student_id": "E007"})\nfor result in reply.json()["results"]:\n    print(result["question"], result["score"], result["maximum_score"], result["confidence"], result["needs_human_review"])'
  return (
    <div>
      <div className="page-head">
        <h1>Use the grader from another application</h1>
        <p>This web app is one client of our grading service. Any other program — Group 1's digitizer, a college LMS, another group's component — can call the same FastAPI service with JSON over HTTP.</p>
      </div>
      <div className="card">
        <div className="card-title"><h2>Endpoints</h2><p>Interactive documentation: <a href={apiAddress + "/docs"} target="_blank" rel="noreferrer">{apiAddress}/docs</a></p></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Method</th><th>Endpoint</th><th>What it does</th></tr></thead>
            <tbody>
              {endpoints.map((row) => <tr key={row[1]}><td>{row[0]}</td><td><code>{row[1]}</code></td><td>{row[2]}</td></tr>)}
            </tbody>
          </table>
        </div>
      </div>
      <div className="card">
        <div className="card-title"><h2>Group 1 → Group 2 in Python</h2></div>
        <pre className="json">{python}</pre>
        <div className="chart-title" style={{ marginTop: 12 }}>Request body for POST /evaluate-group1-pages</div>
        <pre className="json">{JSON.stringify(exampleRequest, null, 2)}</pre>
      </div>
      <div className="card">
        <div className="card-title"><h2>How the pieces fit</h2></div>
        <p>React page (this screen) → Django backend (saves answers and teacher decisions in a database) → FastAPI grading service (<code>api.py</code>) → grader (<code>grader.py</code>: fine-tuned cross-encoder + local LLM through Ollama) and Group 1's digitizer (<code>group1.py</code> → their <code>digitize_page()</code>).</p>
      </div>
    </div>
  )
}
