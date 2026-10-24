import csv
import json
import os
import requests
from django.conf import settings
from django.http import JsonResponse, HttpResponse, FileResponse, Http404
from django.utils import timezone
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET, require_POST
from .models import Exam, GradedAnswer

IMAGE_TYPES = [".jpg", ".jpeg", ".png"]


class GradingServiceError(Exception):
    pass


def call_grading_service(path, body=None, files=None, data=None):
    address = settings.GRADING_API_URL + path
    try:
        if files is not None:
            reply = requests.post(address, files=files, data=data, timeout=300)
        elif body is None:
            reply = requests.get(address, timeout=10)
        else:
            reply = requests.post(address, json=body, timeout=3600)
    except requests.exceptions.ConnectionError:
        raise GradingServiceError("Cannot reach the grading service at " + settings.GRADING_API_URL + ". Start it in the Week 6 folder with: uvicorn api:app --port 8000")
    if reply.status_code != 200:
        try:
            detail = reply.json().get("detail")
        except ValueError:
            detail = reply.text
        raise GradingServiceError("The grading service returned an error (" + str(reply.status_code) + "): " + str(detail))
    return reply.json()


def error_reply(message, status=400):
    return JsonResponse({"error": str(message)}, status=status)


def read_body(request):
    try:
        return json.loads(request.body.decode("utf-8"))
    except ValueError:
        return None


def read_json_file(path):
    if not os.path.exists(path):
        return None
    with open(path) as file:
        return json.load(file)


def number_or_none(value):
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def exam_name(answer):
    if answer.exam is None:
        return ""
    return answer.exam.name


def reviewed_time(answer):
    if answer.reviewed_at is None:
        return None
    return answer.reviewed_at.isoformat()


def answer_to_dict(answer):
    return {
        "id": answer.id,
        "exam": exam_name(answer),
        "source": answer.source,
        "student_id": answer.student_id,
        "question": answer.question,
        "question_text": answer.question_text,
        "answer_text": answer.answer_text,
        "pages": answer.pages,
        "ocr_confidence": answer.ocr_confidence,
        "human_mark": answer.human_mark,
        "recommended_score": answer.recommended_score,
        "maximum_score": answer.maximum_score,
        "confidence": answer.confidence,
        "needs_review": answer.needs_review,
        "review_reasons": answer.result.get("review_reasons", []),
        "teacher_mark": answer.teacher_mark,
        "teacher_comment": answer.teacher_comment,
        "final_mark": answer.final_mark(),
        "reviewed": answer.reviewed_at is not None,
        "reviewed_at": reviewed_time(answer),
        "created_at": answer.created_at.isoformat(),
        "result": answer.result,
    }


def save_result(result, source, exam=None, question_text="", answer_text="", human_mark=None, ocr_confidence=None, pages=None):
    if pages is None:
        pages = result.get("pages") or []
        if len(pages) == 0 and result.get("page") is not None:
            pages = [result.get("page")]
    answer = GradedAnswer.objects.create(
        exam=exam,
        source=source,
        student_id=result.get("student_id") or "",
        question=result.get("question") or "",
        question_text=question_text,
        answer_text=answer_text,
        pages=pages,
        ocr_confidence=ocr_confidence,
        human_mark=human_mark,
        recommended_score=result["score"],
        maximum_score=result["maximum_score"],
        confidence=result["confidence"],
        needs_review=result["needs_human_review"],
        result=result,
    )
    return answer


def group1_samples():
    folder = settings.GROUP1_FOLDER / "data" / "raw_scans"
    names = []
    if folder.exists():
        for name in sorted(os.listdir(folder)):
            if os.path.splitext(name)[1].lower() in IMAGE_TYPES:
                names.append(name)
    return names


@ensure_csrf_cookie
def index(request):
    page = settings.FRONTEND_BUILD / "index.html"
    if not page.exists():
        return HttpResponse("<h2>The React frontend has not been built yet.</h2><p>Run <code>npm install</code> and <code>npm run build</code> in the web/frontend folder, then reload this page.</p>")
    with open(page) as file:
        return HttpResponse(file.read())


@ensure_csrf_cookie
@require_GET
def csrf(request):
    return JsonResponse({"ok": True})


@require_GET
def status(request):
    reply = {"service_ok": False, "health": None, "error": ""}
    try:
        reply["health"] = call_grading_service("/health")
        reply["service_ok"] = True
    except GradingServiceError as error:
        reply["error"] = str(error)
    reply["answers_saved"] = GradedAnswer.objects.count()
    reply["waiting_for_review"] = GradedAnswer.objects.filter(needs_review=True, reviewed_at__isnull=True).count()
    reply["grading_api_url"] = settings.GRADING_API_URL
    return JsonResponse(reply)


@require_GET
def examples(request):
    demo_exam = read_json_file(settings.DEMO_EXAM_FILE) or {}
    upload_example = read_json_file(settings.UPLOAD_EXAMPLE_FILE)
    group1_key = read_json_file(settings.GROUP1_ANSWER_KEY_FILE)
    return JsonResponse({
        "single_examples": demo_exam.get("single_examples", []),
        "sample_exam": {
            "description": demo_exam.get("description", ""),
            "answer_key": demo_exam.get("answer_key", {}),
            "answers": demo_exam.get("answers", []),
            "human_marks": demo_exam.get("human_marks", {}),
        },
        "upload_example": upload_example,
        "group1_samples": group1_samples(),
        "group1_answer_key": group1_key,
    })


@require_POST
def generate_rubric(request):
    body = read_body(request)
    if body is None:
        return error_reply("The request is not valid JSON.")
    try:
        return JsonResponse(call_grading_service("/generate-rubric", {"question_text": body.get("question_text", ""), "reference_answer": body.get("reference_answer", "")}))
    except GradingServiceError as error:
        return error_reply(error, 502)


@require_POST
def grade_one(request):
    body = read_body(request)
    if body is None:
        return error_reply("The request is not valid JSON.")
    request_body = {
        "question_text": body.get("question_text", ""),
        "reference_answer": body.get("reference_answer", ""),
        "student_answer": body.get("student_answer", ""),
        "maximum_marks": number_or_none(body.get("maximum_marks")) or 5,
        "rubric": body.get("rubric") or None,
        "question_id": body.get("question_id") or None,
        "student_id": body.get("student_id") or None,
        "ocr_confidence": number_or_none(body.get("ocr_confidence")),
    }
    try:
        result = call_grading_service("/evaluate-answer", request_body)
    except GradingServiceError as error:
        return error_reply(error, 502)
    answer = save_result(result, "single answer", question_text=request_body["question_text"], answer_text=request_body["student_answer"], human_mark=number_or_none(body.get("human_mark")), ocr_confidence=request_body["ocr_confidence"])
    return JsonResponse({"id": answer.id, "result": result})


@require_POST
def grade_batch(request):
    body = read_body(request)
    if body is None:
        return error_reply("The request is not valid JSON.")
    answer_key = body.get("answer_key") or {}
    answers = body.get("answers") or []
    if len(answer_key) == 0 or len(answers) == 0:
        return error_reply("Both answer_key and answers are needed.")
    try:
        reply = call_grading_service("/evaluate-batch", {"answer_key": answer_key, "answers": answers})
    except GradingServiceError as error:
        return error_reply(error, 502)
    exam = Exam.objects.create(name=body.get("exam_name") or "Answer sheets", answer_key=answer_key, source="answer sheet")
    human_marks = body.get("human_marks") or {}
    saved = []
    for position in range(len(reply["results"])):
        result = reply["results"][position]
        record = answers[position]
        question_text = answer_key.get(str(result.get("question")), {}).get("question_text", "")
        human_mark = number_or_none(human_marks.get(str(result.get("student_id")) + " " + str(result.get("question"))))
        answer = save_result(result, "answer sheet", exam=exam, question_text=question_text, answer_text=record.get("answer_text", ""), human_mark=human_mark, ocr_confidence=number_or_none(record.get("confidence")))
        saved.append(answer_to_dict(answer))
    return JsonResponse({"exam_id": exam.id, "answers": saved, "answers_graded": reply["answers_graded"], "answers_needing_review": reply["answers_needing_review"]})


@require_POST
def scan_pages(request):
    images = request.FILES.getlist("images")
    if len(images) == 0:
        return error_reply("Choose at least one page image.")
    pages = []
    for position in range(len(images)):
        image = images[position]
        if os.path.splitext(image.name)[1].lower() not in IMAGE_TYPES:
            return error_reply(image.name + " is not a .jpg or .png image.")
        try:
            record = call_grading_service("/digitize", files={"image": (image.name, image.read(), image.content_type or "image/jpeg")}, data={"page_number": str(position + 1)})
        except GradingServiceError as error:
            return error_reply(error, 502)
        record["file_name"] = image.name
        pages.append(record)
    return JsonResponse({"pages": pages})


@require_POST
def scan_sample(request):
    body = read_body(request)
    if body is None:
        return error_reply("The request is not valid JSON.")
    name = body.get("name", "")
    if name not in group1_samples():
        return error_reply("Unknown sample page.", 404)
    path = settings.GROUP1_FOLDER / "data" / "raw_scans" / name
    with open(path, "rb") as file:
        content = file.read()
    try:
        record = call_grading_service("/digitize", files={"image": (name, content, "image/jpeg")}, data={"page_number": "1"})
    except GradingServiceError as error:
        return error_reply(error, 502)
    record["file_name"] = name
    return JsonResponse({"pages": [record]})


@require_GET
def sample_image(request, name):
    if name not in group1_samples():
        raise Http404("Unknown sample page")
    return FileResponse(open(settings.GROUP1_FOLDER / "data" / "raw_scans" / name, "rb"))


@require_POST
def grade_scan(request):
    body = read_body(request)
    if body is None:
        return error_reply("The request is not valid JSON.")
    answer_key = body.get("answer_key") or {}
    pages = body.get("pages") or []
    if len(answer_key) == 0 or len(pages) == 0:
        return error_reply("Both an answer key and at least one page are needed.")
    clean_pages = []
    for page in pages:
        clean_pages.append({
            "student_id": page.get("student_id"),
            "question": page.get("question"),
            "answer_text": page.get("answer_text", ""),
            "page": page.get("page"),
            "ocr_confidence": number_or_none(page.get("ocr_confidence")),
        })
    student_id = body.get("student_id") or None
    try:
        reply = call_grading_service("/evaluate-group1-pages", {"answer_key": answer_key, "pages": clean_pages, "student_id": student_id})
    except GradingServiceError as error:
        return error_reply(error, 502)
    exam = Exam.objects.create(name=body.get("exam_name") or "Scanned answer sheet", answer_key=answer_key, source="group 1 scan")
    saved = []
    for result in reply["results"]:
        confidences = []
        for page in clean_pages:
            if page["page"] in (result.get("pages") or []) and page["ocr_confidence"] is not None:
                confidences.append(page["ocr_confidence"])
        ocr_confidence = None
        if len(confidences) > 0:
            ocr_confidence = min(confidences)
        question_text = answer_key.get(str(result.get("question")), {}).get("question_text", "")
        answer = save_result(result, "group 1 scan", exam=exam, question_text=question_text, answer_text=result.get("answer_text") or "", ocr_confidence=ocr_confidence)
        saved.append(answer_to_dict(answer))
    return JsonResponse({"exam_id": exam.id, "answers": saved, "answers_graded": reply["answers_graded"], "answers_needing_review": reply["answers_needing_review"]})


@require_GET
def list_answers(request):
    answers = GradedAnswer.objects.select_related("exam").all()
    if request.GET.get("flagged") == "1":
        answers = answers.filter(needs_review=True)
    if request.GET.get("source"):
        answers = answers.filter(source=request.GET.get("source"))
    rows = []
    for answer in answers[:500]:
        rows.append(answer_to_dict(answer))
    return JsonResponse({"answers": rows})


@require_POST
def review_answer(request, answer_id):
    try:
        answer = GradedAnswer.objects.get(id=answer_id)
    except GradedAnswer.DoesNotExist:
        return error_reply("Answer not found.", 404)
    body = read_body(request)
    if body is None:
        return error_reply("The request is not valid JSON.")
    teacher_mark = number_or_none(body.get("teacher_mark"))
    if body.get("teacher_mark") not in [None, ""] and teacher_mark is None:
        return error_reply("The teacher's mark must be a number.")
    if teacher_mark is not None and (teacher_mark < 0 or teacher_mark > answer.maximum_score):
        return error_reply("The teacher's mark must be between 0 and " + str(answer.maximum_score) + ".")
    answer.teacher_mark = teacher_mark
    answer.teacher_comment = body.get("teacher_comment", "")
    answer.reviewed_at = timezone.now()
    answer.save()
    return JsonResponse({"answer": answer_to_dict(answer)})


@require_POST
def remove_review(request, answer_id):
    try:
        answer = GradedAnswer.objects.get(id=answer_id)
    except GradedAnswer.DoesNotExist:
        return error_reply("Answer not found.", 404)
    answer.teacher_mark = None
    answer.teacher_comment = ""
    answer.reviewed_at = None
    answer.save()
    return JsonResponse({"answer": answer_to_dict(answer)})


@require_POST
def delete_answer(request, answer_id):
    try:
        answer = GradedAnswer.objects.get(id=answer_id)
    except GradedAnswer.DoesNotExist:
        return error_reply("Answer not found.", 404)
    answer.delete()
    return JsonResponse({"deleted": answer_id})


@require_GET
def export_answers(request):
    response = HttpResponse(content_type="text/csv")
    response["Content-Disposition"] = 'attachment; filename="graded answers.csv"'
    writer = csv.writer(response)
    writer.writerow(["id", "date", "source", "exam", "student_id", "question", "recommended_score", "maximum_score", "confidence", "needs_review", "review_reasons", "teacher_mark", "teacher_comment", "final_mark", "answer_text"])
    for answer in GradedAnswer.objects.select_related("exam").all():
        writer.writerow([
            answer.id,
            timezone.localtime(answer.created_at).strftime("%Y-%m-%d %H:%M"),
            answer.source,
            exam_name(answer),
            answer.student_id,
            answer.question,
            answer.recommended_score,
            answer.maximum_score,
            answer.confidence,
            answer.needs_review,
            " | ".join(answer.result.get("review_reasons", [])),
            answer.teacher_mark,
            answer.teacher_comment,
            answer.final_mark(),
            answer.answer_text,
        ])
    return response


@require_GET
def evaluation(request):
    summary = read_json_file(settings.CHART_SUMMARY_FILE)
    week7 = {}
    for name, file_name in [("ocr_noise", "week 7 ocr noise summary.csv"), ("ocr_bootstrap", "week 7 ocr noise bootstrap.csv"), ("ocr_quality", "week 7 ocr quality.csv"), ("group1_grades", "week 7 group 1 grades.csv")]:
        path = settings.WEEK7_RESULTS / file_name
        if path.exists():
            with open(path) as file:
                week7[name] = list(csv.DictReader(file))
    return JsonResponse({"summary": summary, "week7": week7})
