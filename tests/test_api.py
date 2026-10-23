import io
from fastapi.testclient import TestClient
import api

client = TestClient(api.app)


def llm_not_running():
    return False


def test_health():
    reply = client.get("/health")
    assert reply.status_code == 200
    body = reply.json()
    assert body["status"] == "ok"
    assert "group1_digitizer_available" in body


def test_missing_field_gives_422():
    reply = client.post("/evaluate-answer", json={"question_text": "What is a stack?", "reference_answer": "LIFO"})
    assert reply.status_code == 422


def test_empty_reference_gives_400():
    reply = client.post("/evaluate-answer", json={"question_text": "What is a stack?", "reference_answer": " ", "student_answer": "LIFO"})
    assert reply.status_code == 400


def test_blank_answer_through_the_api():
    reply = client.post("/evaluate-answer", json={"question_text": "What is a stack?", "reference_answer": "LIFO list", "student_answer": "not answered", "maximum_marks": 5})
    assert reply.status_code == 200
    assert reply.json()["score"] == 0


def test_unknown_question_in_batch_gives_400():
    reply = client.post("/evaluate-batch", json={"answer_key": {"Q1": {"question_text": "Q", "reference_answer": "R"}}, "answers": [{"student_id": "S1", "question": "Q9", "answer_text": "x"}]})
    assert reply.status_code == 400


def test_group1_pages_unknown_question_gives_400():
    answer_key = {"Q1": {"question_text": "Q", "reference_answer": "R", "maximum_marks": 10}, "Q2": {"question_text": "Q", "reference_answer": "R"}}
    reply = client.post("/evaluate-group1-pages", json={"answer_key": answer_key, "pages": [{"answer_text": "Q3) about routing", "page": 1, "ocr_confidence": 0.9}]})
    assert reply.status_code == 400
    assert "Q3" in reply.json()["detail"]


def test_group1_page_is_graded_and_flagged(monkeypatch):
    monkeypatch.setattr(api.grader, "llm_is_available", llm_not_running)
    answer_key = {"Q1": {"question_text": "What is a stack?", "reference_answer": "A LIFO list", "maximum_marks": 10}}
    reply = client.post("/evaluate-group1-pages", json={"answer_key": answer_key, "pages": [{"answer_text": "Name - A\nQ1) A stack is last in first out", "page": 1, "ocr_confidence": 0.5}]})
    assert reply.status_code == 200
    result = reply.json()["results"][0]
    assert result["pages"] == [1]
    assert result["removed_header"] == "Name - A"
    assert result["needs_human_review"] is True


def test_digitize_rejects_non_images():
    reply = client.post("/digitize", files={"image": ("notes.txt", io.BytesIO(b"hello"), "text/plain")})
    assert reply.status_code in [400, 503]
