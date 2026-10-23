import os
import re
import sys
import shutil

FOLDER = os.path.dirname(os.path.abspath(__file__))
GROUP1_FOLDER = os.environ.get("GROUP1_DIGITIZER_PATH", os.path.join(FOLDER, "..", "..", "Group 1 digitizer"))

marker_pattern = re.compile(r"^[ \t(]*(?:q(?:ues(?:tion)?)?\s*\.?\s*([0-9]{1,2}|l|i|\|)|@\s*([0-9]{1,2}|l|i|\|))\s*[.)\]:-]?(?=\s)", re.IGNORECASE | re.MULTILINE)


def digitizer_available():
    source_folder = os.path.join(GROUP1_FOLDER, "src")
    if not os.path.exists(os.path.join(source_folder, "digitizer.py")):
        return False
    if shutil.which("tesseract") is None:
        return False
    return True


def digitize(image_path, page_number=None):
    source_folder = os.path.abspath(os.path.join(GROUP1_FOLDER, "src"))
    if not digitizer_available():
        raise RuntimeError("Group 1's digitizer is not available. Put their project in " + os.path.abspath(GROUP1_FOLDER) + " (or set GROUP1_DIGITIZER_PATH) and install Tesseract.")
    if source_folder not in sys.path:
        sys.path.append(source_folder)
    from digitizer import digitize_page
    record = digitize_page(image_path, page_number=page_number)
    entities = []
    for entity in record.get("entities_found", []):
        entities.append({"text": entity.get("text"), "label": entity.get("label"), "start_char": entity.get("start_char"), "end_char": entity.get("end_char")})
    record["entities_found"] = entities
    return record


def question_label(raw_number):
    digits = ""
    for character in str(raw_number).lower():
        if character in "il|":
            digits = digits + "1"
        elif character == "o":
            digits = digits + "0"
        elif character.isdigit():
            digits = digits + character
    if digits == "":
        return None
    return "Q" + str(int(digits))


def one_line(text):
    return " ".join(str(text).split())


def split_into_questions(text):
    matches = list(marker_pattern.finditer(text))
    if len(matches) == 0:
        return text, []
    before_first = text[:matches[0].start()]
    parts = []
    for number in range(len(matches)):
        match = matches[number]
        raw_number = match.group(1)
        if raw_number is None:
            raw_number = match.group(2)
        start = match.start()
        if number + 1 < len(matches):
            end = matches[number + 1].start()
        else:
            end = len(text)
        parts.append({"question": question_label(raw_number), "text": text[start:end]})
    return before_first, parts


def page_number_of(record, position):
    if record.get("page") is not None:
        return record["page"]
    return position + 1


def pages_to_answers(records, student_id=None):
    numbered = []
    for position in range(len(records)):
        numbered.append((page_number_of(records[position], position), position, records[position]))
    numbered.sort()

    answers = []
    current = None
    known_student_id = student_id
    for page, position, record in numbered:
        if known_student_id is None and record.get("student_id"):
            known_student_id = record.get("student_id")
        confidence = record.get("ocr_confidence")
        if confidence is None:
            confidence = record.get("confidence")
        before_first, parts = split_into_questions(str(record.get("answer_text", "")))

        if len(parts) == 0:
            if current is None:
                current = {"question": record.get("question"), "answer_text": one_line(before_first), "pages": [page], "confidence": confidence, "removed_header": "", "notes": []}
                if current["question"] is None:
                    current["notes"].append("No question number was found on page " + str(page) + ".")
                answers.append(current)
            else:
                current["answer_text"] = one_line(current["answer_text"] + " " + before_first)
                current["pages"].append(page)
                current["confidence"] = lowest(current["confidence"], confidence)
            continue

        if one_line(before_first) != "":
            if current is None:
                header = one_line(before_first)
            else:
                current["answer_text"] = one_line(current["answer_text"] + " " + before_first)
                current["pages"].append(page)
                current["confidence"] = lowest(current["confidence"], confidence)
                header = ""
        else:
            header = ""

        for part in parts:
            current = {"question": part["question"], "answer_text": one_line(part["text"]), "pages": [page], "confidence": confidence, "removed_header": header, "notes": []}
            header = ""
            answers.append(current)

    for answer in answers:
        answer["student_id"] = known_student_id
        if known_student_id is None:
            answer["notes"].append("The student ID could not be read from the answer sheet.")
        answer["page"] = answer["pages"][0]
    return answers


def lowest(first, second):
    if first is None:
        return second
    if second is None:
        return first
    return min(first, second)


def grade_pages(grader, records, answer_key, student_id=None):
    answers = pages_to_answers(records, student_id)
    results = []
    for answer in answers:
        question_id = answer["question"]
        if question_id not in answer_key and len(answer_key) == 1:
            question_id = list(answer_key.keys())[0]
            answer["notes"].append("Question number not read; graded as " + question_id + ", the only question in the answer key.")
        if question_id not in answer_key:
            raise ValueError("Question " + str(answer["question"]) + " (pages " + str(answer["pages"]) + ") is not in the answer key")
        key = answer_key[question_id]
        result = grader.evaluate_answer(
            key["question_text"],
            key["reference_answer"],
            answer["answer_text"],
            maximum_marks=key.get("maximum_marks", 5),
            rubric=key.get("rubric"),
            question_id=question_id,
            student_id=answer["student_id"],
            ocr_confidence=answer["confidence"],
        )
        for note in answer["notes"]:
            result["review_reasons"].append(note)
        if len(answer["notes"]) > 0:
            result["needs_human_review"] = True
        result["page"] = answer["page"]
        result["pages"] = answer["pages"]
        result["answer_text"] = answer["answer_text"]
        result["removed_header"] = answer["removed_header"]
        results.append(result)
    return results
