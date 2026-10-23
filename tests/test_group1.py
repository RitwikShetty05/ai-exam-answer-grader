import group1


def test_question_label_reads_ocr_mistakes():
    assert group1.question_label("1") == "Q1"
    assert group1.question_label("l") == "Q1"
    assert group1.question_label("|") == "Q1"
    assert group1.question_label("12") == "Q12"
    assert group1.question_label("") is None


def test_header_is_removed_and_question_found():
    record = {"answer_text": "ISP Assignment 3 - Eool Aayush\nQL OSI Model in email\nThe application layer uses SMTP", "page": 1, "ocr_confidence": 0.82, "student_id": None, "question": "Q1"}
    answers = group1.pages_to_answers([record])
    assert len(answers) == 1
    assert answers[0]["question"] == "Q1"
    assert answers[0]["removed_header"] == "ISP Assignment 3 - Eool Aayush"
    assert answers[0]["answer_text"].startswith("QL OSI Model")
    assert answers[0]["confidence"] == 0.82


def test_missing_student_id_adds_a_note():
    record = {"answer_text": "Q1) A stack is last in first out", "page": 1, "ocr_confidence": 0.9}
    answers = group1.pages_to_answers([record])
    assert answers[0]["student_id"] is None
    assert any("student ID" in note for note in answers[0]["notes"])


def test_teacher_typed_student_id_is_used():
    record = {"answer_text": "Q1) A stack is last in first out", "page": 1, "ocr_confidence": 0.9}
    answers = group1.pages_to_answers([record], student_id="E007")
    assert answers[0]["student_id"] == "E007"
    assert answers[0]["notes"] == []


def test_pages_are_joined_and_split():
    pages = [
        {"answer_text": "Name - A\nQ1) A stack stores items\nso the last in", "page": 1, "ocr_confidence": 0.9, "student_id": "E099"},
        {"answer_text": "is the first out.\nQ2. A queue is first in first out", "page": 2, "ocr_confidence": 0.7},
    ]
    answers = group1.pages_to_answers(pages)
    assert [answer["question"] for answer in answers] == ["Q1", "Q2"]
    assert answers[0]["pages"] == [1, 2]
    assert answers[0]["answer_text"] == "Q1) A stack stores items so the last in is the first out."
    assert answers[0]["confidence"] == 0.7
    assert answers[1]["pages"] == [2]
    assert answers[1]["student_id"] == "E099"


def test_pages_are_sorted_by_page_number():
    pages = [
        {"answer_text": "continued text", "page": 2, "ocr_confidence": 0.9},
        {"answer_text": "Q1) first part", "page": 1, "ocr_confidence": 0.9, "student_id": "E1"},
    ]
    answers = group1.pages_to_answers(pages)
    assert answers[0]["answer_text"] == "Q1) first part continued text"
