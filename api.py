import threading
from typing import Dict, List, Optional
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
import grader

app = FastAPI(
    title="AI Exam Answer Grader — Group 2",
    version="1.0 (Week 6)",
    description=(
        "Recommends a mark and feedback for a student's descriptive answer by comparing it with a reference answer and a marking rubric. "
        "It combines a fine-tuned cross-encoder (semantic similarity) with a local LLM that checks each rubric concept against the student's own words. "
        "The mark is advisory: answers with low confidence, instruction-like text or low OCR confidence are flagged for a teacher. "
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
        "version": grader.settings["version"],
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
