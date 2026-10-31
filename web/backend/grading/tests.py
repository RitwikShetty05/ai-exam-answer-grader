import json
from unittest import mock
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

    def test_delete_answer(self):
        reply = self.post("/api/answers/" + str(self.answer.id) + "/delete", {})
        self.assertEqual(reply.status_code, 200)
        self.assertEqual(GradedAnswer.objects.count(), 0)
        again = self.post("/api/answers/" + str(self.answer.id) + "/delete", {})
        self.assertEqual(again.status_code, 404)


class CodeTourTests(TestCase):
    def setUp(self):
        self.client = Client(HTTP_HOST="localhost")

    def test_files_are_listed(self):
        reply = self.client.get("/api/code")
        self.assertEqual(reply.status_code, 200)
        paths = []
        for group in reply.json()["groups"]:
            for item in group["files"]:
                paths.append(item["path"])
        self.assertIn("src/grader.py", paths)

    def test_listed_file_is_sent_with_explanations(self):
        reply = self.client.get("/api/code/file", {"path": "src/grader.py"})
        self.assertEqual(reply.status_code, 200)
        body = reply.json()
        self.assertIn("def evaluate_answer", body["content"])
        self.assertIn("evaluate_answer", body["explanations"])

    def test_other_files_are_refused(self):
        for path in ["../../etc/passwd", "web/backend/gradersite/settings.py", "web/backend/db.sqlite3"]:
            reply = self.client.get("/api/code/file", {"path": path})
            self.assertEqual(reply.status_code, 404)


class StackTests(TestCase):
    def test_versions_are_reported(self):
        reply = Client(HTTP_HOST="localhost").get("/api/stack")
        self.assertEqual(reply.status_code, 200)
        versions = reply.json()["versions"]
        self.assertIsNotNone(versions["django"])
        self.assertIn("react", versions)


class ShutdownTests(TestCase):
    def test_shutdown_stops_the_services(self):
        with mock.patch("grading.views.requests.post") as fake_post, mock.patch("grading.views.threading.Timer") as fake_timer, mock.patch("grading.views.launcher.stop_ollama_if_started", return_value=False):
            reply = Client(HTTP_HOST="localhost").post("/api/shutdown", data="{}", content_type="application/json")
        self.assertEqual(reply.status_code, 200)
        self.assertIn("grading api", reply.json()["stopped"])
        self.assertIn("web app", reply.json()["stopped"])
        fake_post.assert_called_once()
        fake_timer.return_value.start.assert_called_once()

    def test_shutdown_needs_post(self):
        reply = Client(HTTP_HOST="localhost").get("/api/shutdown")
        self.assertEqual(reply.status_code, 405)

