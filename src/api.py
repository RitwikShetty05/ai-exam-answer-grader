import os
import tempfile
import threading
from typing import Dict, List, Optional
from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from pydantic import BaseModel, Field
import grader
import group1

app = FastAPI(
    title="AI Exam Answer Grader — Group 2",
    version="1.1 (Week 7)",
    description=(
        "Recommends a mark and feedback for a student's descriptive answer by comparing it with a reference answer and a marking rubric. "
        "It combines a fine-tuned cross-encoder (semantic similarity) with a local LLM that checks each rubric concept against the student's own words. "
        "The mark is advisory: answers with low confidence, instruction-like text or low OCR confidence are flagged for a teacher. "
        "Week 7 adds direct support for Group 1's Handwritten Exam Digitizer: POST /digitize reads a scanned page with their digitize_page(), and POST /evaluate-group1-pages grades their page records as they are. "
        "Everything runs on the local machine; no answer text is sent to an external AI service."
    ),
)

grading_lock = threading.Lock()


class AnswerRequest(BaseModel):
    question_text: str = Field(..., description="The exam question.", examples=["What is a queue?"])
    reference_answer: str = Field(..., description="The model answer written by the teacher.", examples=["A data structure that stores elements following the first in first out principle. The main operations are enqueue and dequeue."])
    student_answer: str = Field(..., description="The student's answer as plain text (for example answer_text from Group 1's digitizer).", examples=["A queue is a list where the first item added is the first one removed (FIFO), using enqueue and dequeue."])
    maximum_marks: float = Field(5, gt=0, description="Maximum marks for this question. The recommended score is scaled to this and rounded to 0.5.")
    rubric: Optional[List[str]] = Field(None, description="Optional marking rubric: one key concept per item, all worth the same. If left out, a rubric is generated from the reference answer (see rubric_source in the response).", examples=[["It stores elements in first in first out order.", "Elements are added with enqueue.", "Elements are removed with dequeue."]])
    question_id: Optional[str] = Field(None, description="Optional label returned as 'question', for example 'Q4'.", examples=["Q4"])
    student_id: Optional[str] = Field(None, description="Optional student identifier, returned unchanged.", examples=["S01"])
    ocr_confidence: Optional[float] = Field(None, ge=0, le=1, description="Optional OCR confidence from Group 1's digitizer. Below 0.80 the answer is flagged for a teacher to check the transcription.")


class RubricRequest(BaseModel):
    question_text: str = Field(..., description="The exam question.")
    reference_answer: str = Field(..., description="The model answer written by the teacher.")


class Group1Record(BaseModel):
    student_id: str = Field(..., description="Student identifier from the digitizer.", examples=["23D001"])
    question: str = Field(..., description="Question label; must match a key in answer_key.", examples=["Q3"])
    answer_text: str = Field(..., description="The digitized answer text.")
    page: Optional[int] = Field(None, description="Page number on the answer sheet.", examples=[4])
    confidence: Optional[float] = Field(None, ge=0, le=1, description="OCR confidence from the digitizer.", examples=[0.91])


class AnswerKeyItem(BaseModel):
    question_text: str = Field(..., description="The exam question.")
    reference_answer: str = Field(..., description="The model answer.")
    maximum_marks: float = Field(5, gt=0, description="Maximum marks for this question.")
    rubric: Optional[List[str]] = Field(None, description="Optional rubric, one key concept per item.")


class Group1Page(BaseModel):
    student_id: Optional[str] = Field(None, description="Student ID read by Group 1's digitizer (often missing on handwritten pages).", examples=["E007"])
    question: Optional[str] = Field(None, description="Question number guessed by Group 1's digitizer.", examples=["Q1"])
    answer_text: str = Field(..., description="The full OCR text of the page, exactly as digitize_page() returns it.")
    page: Optional[int] = Field(None, description="Page number of the answer sheet.", examples=[1])
    marks_detected: Optional[str] = Field(None, description="Marks written on the page, if any (not used for grading).")
    ocr_confidence: Optional[float] = Field(None, ge=0, le=1, description="Tesseract's average word confidence for the page (0-1).", examples=[0.82])
    confidence: Optional[float] = Field(None, ge=0, le=1, description="Same as ocr_confidence (the field name used in the course handout).")
    entities_found: Optional[List[dict]] = Field(None, description="Entity candidates from Group 1's NER (not used for grading).")


class Group1PagesRequest(BaseModel):
    answer_key: Dict[str, AnswerKeyItem] = Field(..., description="One entry per question label with the question, reference answer, maximum marks and optional rubric.")
    pages: List[Group1Page] = Field(..., description="Page records exactly as Group 1's digitize_page() returns them, one per scanned page, for one student.")
    student_id: Optional[str] = Field(None, description="Student ID typed by the teacher, used when the digitizer could not read it from the page.", examples=["E007"])


class BatchRequest(BaseModel):
    answer_key: Dict[str, AnswerKeyItem] = Field(..., description="One entry per question label (for example 'Q3') with the question, reference answer, maximum marks and optional rubric.")
    answers: List[Group1Record] = Field(..., description="Answers in Group 1's Handwritten Exam Digitizer output format.")


class ConceptResult(BaseModel):
    concept: str = Field(..., description="A rubric concept.")
    status: str = Field(..., description="present, partial or missing.")
    evidence: str = Field(..., description="The student's own words that show the concept (empty when missing).")


class GradeResult(BaseModel):
    question: Optional[str] = Field(None, description="The question label from the request.")
    student_id: Optional[str] = Field(None, description="The student identifier from the request.")
    page: Optional[int] = Field(None, description="Page number (batch requests only).")
    pages: Optional[List[int]] = Field(None, description="All pages this answer was found on (Group 1 page requests only).")
    answer_text: Optional[str] = Field(None, description="The answer text that was graded, after the page header was removed (Group 1 page requests only).")
    removed_header: Optional[str] = Field(None, description="Header text removed from the first page, such as name and roll number (Group 1 page requests only).")
    score: float = Field(..., description="Recommended score, scaled to maximum_score and rounded to 0.5. Advisory only.")
    maximum_score: float = Field(..., description="Maximum marks for the question.")
    feedback: str = Field(..., description="Explainable feedback: which rubric concepts are covered, partly covered or missing, plus a short comment.")
    confidence: float = Field(..., description="Estimated chance (0-1) that the score is within 20% of the maximum marks of a human grader's mark (within 1 mark on a 5-mark question).")
    needs_human_review: bool = Field(..., description="True if a teacher should check this answer before the mark is used.")
    review_reasons: List[str] = Field(..., description="Why the answer was flagged (empty if not flagged).")
    concepts: List[ConceptResult] = Field(..., description="Concept-by-concept check against the rubric.")
    wrong_statements: List[str] = Field(..., description="Statements the LLM judged to be factually wrong.")
    rubric_source: Optional[str] = Field(None, description="teacher (given in the request), saved (rubric made earlier) or generated (made now from the reference answer; a teacher should check it).")
    grading_mode: str = Field(..., description="full, similarity_only (LLM not running) or blank_answer.")
    scores_out_of_5: Dict[str, float] = Field(..., description="Component scores on a 0-5 scale: similarity_model, llm, rubric, llm_calibrated and final.")
    seconds: float = Field(..., description="Time taken to grade this answer.")


class BatchResult(BaseModel):
    results: List[GradeResult]
    answers_graded: int
    answers_needing_review: int


class RubricResult(BaseModel):
    rubric: List[str]
    rubric_source: str


@app.get("/health", summary="Check that the service and its models are ready")
def health():
    return {
        "status": "ok",
        "similarity_model_loaded": True,
        "llm_available": grader.llm_is_available(),
        "llm_provider": grader.LLM_PROVIDER,
        "llm_model": grader.LLM_MODEL,
        "group1_digitizer_available": group1.digitizer_available(),
        "version": "week 7",
    }


@app.post("/generate-rubric", response_model=RubricResult, summary="Generate a rubric from a reference answer for a teacher to check")
def generate_rubric(request: RubricRequest):
    try:
        with grading_lock:
            concepts, source = grader.make_rubric(request.question_text, request.reference_answer)
    except RuntimeError as error:
        raise HTTPException(status_code=503, detail=str(error))
    return {"rubric": concepts, "rubric_source": source}


@app.post("/evaluate-answer", response_model=GradeResult, summary="Recommend a score, feedback and confidence for one answer")
def evaluate_answer(request: AnswerRequest):
    try:
        with grading_lock:
            return grader.evaluate_answer(
                request.question_text,
                request.reference_answer,
                request.student_answer,
                maximum_marks=request.maximum_marks,
                rubric=request.rubric,
                question_id=request.question_id,
                student_id=request.student_id,
                ocr_confidence=request.ocr_confidence,
            )
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))
    except RuntimeError as error:
        raise HTTPException(status_code=503, detail=str(error))


@app.post("/evaluate-batch", response_model=BatchResult, summary="Grade a batch of answers in Group 1's digitizer format")
def evaluate_batch(request: BatchRequest):
    answer_key = {}
    for question_id, item in request.answer_key.items():
        answer_key[question_id] = item.model_dump()
    results = []
    for record in request.answers:
        try:
            with grading_lock:
                results.append(grader.evaluate_group1_record(record.model_dump(), answer_key))
        except ValueError as error:
            raise HTTPException(status_code=400, detail=str(error))
        except RuntimeError as error:
            raise HTTPException(status_code=503, detail=str(error))
    needing_review = 0
    for result in results:
        if result["needs_human_review"]:
            needing_review = needing_review + 1
    return {"results": results, "answers_graded": len(results), "answers_needing_review": needing_review}


@app.post("/digitize", summary="Read a scanned answer sheet page with Group 1's Handwritten Exam Digitizer")
def digitize(image: UploadFile = File(..., description="A scanned or photographed answer sheet page (jpg or png)."), page_number: Optional[int] = Form(None, description="Page number of this page.")):
    if not group1.digitizer_available():
        raise HTTPException(status_code=503, detail="Group 1's digitizer is not installed on this computer (see GET /health).")
    extension = os.path.splitext(image.filename or "")[1].lower()
    if extension not in [".jpg", ".jpeg", ".png"]:
        raise HTTPException(status_code=400, detail="Please upload a .jpg or .png image of one page.")
    temporary = tempfile.NamedTemporaryFile(suffix=extension, delete=False)
    try:
        temporary.write(image.file.read())
        temporary.close()
        with grading_lock:
            record = group1.digitize(temporary.name, page_number=page_number)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))
    finally:
        os.remove(temporary.name)
    return record


@app.post("/evaluate-group1-pages", response_model=BatchResult, summary="Grade page records exactly as Group 1's digitizer returns them")
def evaluate_group1_pages(request: Group1PagesRequest):
    answer_key = {}
    for question_id, item in request.answer_key.items():
        answer_key[question_id] = item.model_dump()
    pages = []
    for page in request.pages:
        pages.append(page.model_dump())
    try:
        with grading_lock:
            results = group1.grade_pages(grader, pages, answer_key, request.student_id)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))
    except RuntimeError as error:
        raise HTTPException(status_code=503, detail=str(error))
    needing_review = 0
    for result in results:
        if result["needs_human_review"]:
            needing_review = needing_review + 1
    return {"results": results, "answers_graded": len(results), "answers_needing_review": needing_review}
