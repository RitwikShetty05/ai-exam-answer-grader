import json
from django.test import TestCase, Client
from .models import GradedAnswer


class ReviewTests(TestCase):
    def setUp(self):
        self.client = Client(HTTP_HOST="localhost")
        self.answer = GradedAnswer.objects.create(
            source="single answer",
            student_id="S1",
            question="Q1",
            recommended_score=4.0,
            maximum_score=5.0,
            confidence=0.55,
            needs_review=True,
            result={"review_reasons": ["Low confidence (0.55): the similarity model and the LLM disagree."]},
        )

    def post(self, path, body):
        return self.client.post(path, data=json.dumps(body), content_type="application/json")

    def test_save_review(self):
        reply = self.post("/api/answers/" + str(self.answer.id) + "/review", {"teacher_mark": "3.5", "teacher_comment": "Missing one point"})
        self.assertEqual(reply.status_code, 200)
        saved = reply.json()["answer"]
        self.assertEqual(saved["teacher_mark"], 3.5)
        self.assertEqual(saved["final_mark"], 3.5)
        self.assertTrue(saved["reviewed"])

    def test_mark_outside_range_is_rejected(self):
        reply = self.post("/api/answers/" + str(self.answer.id) + "/review", {"teacher_mark": "9"})
        self.assertEqual(reply.status_code, 400)

    def test_remove_review(self):
        self.post("/api/answers/" + str(self.answer.id) + "/review", {"teacher_mark": "3.5", "teacher_comment": "Missing one point"})
        reply = self.post("/api/answers/" + str(self.answer.id) + "/remove-review", {})
        self.assertEqual(reply.status_code, 200)
        cleared = reply.json()["answer"]
        self.assertIsNone(cleared["teacher_mark"])
        self.assertEqual(cleared["teacher_comment"], "")
        self.assertFalse(cleared["reviewed"])
        self.assertEqual(cleared["final_mark"], 4.0)

    def test_remove_review_unknown_answer(self):
        reply = self.post("/api/answers/99999/remove-review", {})
        self.assertEqual(reply.status_code, 404)

    def test_answers_are_listed(self):
        reply = self.client.get("/api/answers")
        self.assertEqual(reply.status_code, 200)
        self.assertEqual(len(reply.json()["answers"]), 1)
