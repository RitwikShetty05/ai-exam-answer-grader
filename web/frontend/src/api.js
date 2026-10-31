import { showToast } from "./components/ui.jsx"

const successMessages = [
  ["/api/grade-batch", "Answer sheet graded"],
  ["/api/grade-scan", "Scanned answer sheet graded"],
  ["/api/grade", "Answer graded"],
  ["/api/scan-sample", "Page read by Group 1's digitizer"],
  ["/api/scan", "Pages read by Group 1's digitizer"],
  ["/remove-review", "Review removed: the answer is back in the queue"],
  ["/review", "Teacher's decision saved"],
  ["/delete", "Answer removed"],
  ["/api/rubric", "Rubric suggested from the reference answer"],
]

function successMessage(path) {
  for (const pair of successMessages) {
    if (path.indexOf(pair[0]) >= 0) {
      return pair[1]
    }
  }
  return ""
}

function readCookie(name) {
  const parts = document.cookie.split(";")
  for (const part of parts) {
    const pieces = part.trim().split("=")
    if (pieces[0] === name) {
      return decodeURIComponent(pieces.slice(1).join("="))
    }
  }
  return ""
}

async function readReply(reply) {
  let body = {}
  try {
    body = await reply.json()
  } catch {
    body = {}
  }
  if (!reply.ok) {
    throw new Error(body.error || "The request failed (" + reply.status + ").")
  }
  return body
}

async function sendAndAnnounce(path, options) {
  let reply = null
  try {
    reply = await fetch(path, options)
  } catch {
    const problem = new Error("Cannot reach the web app. Is it still running?")
    showToast(problem.message, "bad")
    throw problem
  }
  try {
    const body = await readReply(reply)
    const message = successMessage(path)
    if (message !== "") {
      showToast(message, "good")
    }
    return body
  } catch (problem) {
    showToast(problem.message, "bad")
    throw problem
  }
}

export async function getJson(path) {
  const reply = await fetch(path)
  return readReply(reply)
}

export async function postJson(path, data) {
  return sendAndAnnounce(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-CSRFToken": readCookie("csrftoken") },
    body: JSON.stringify(data),
  })
}

export async function postForm(path, formData) {
  return sendAndAnnounce(path, {
    method: "POST",
    headers: { "X-CSRFToken": readCookie("csrftoken") },
    body: formData,
  })
}
