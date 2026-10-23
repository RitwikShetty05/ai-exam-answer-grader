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

export async function getJson(path) {
  const reply = await fetch(path)
  return readReply(reply)
}

export async function postJson(path, data) {
  const reply = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-CSRFToken": readCookie("csrftoken") },
    body: JSON.stringify(data),
  })
  return readReply(reply)
}

export async function postForm(path, formData) {
  const reply = await fetch(path, {
    method: "POST",
    headers: { "X-CSRFToken": readCookie("csrftoken") },
    body: formData,
  })
  return readReply(reply)
}
