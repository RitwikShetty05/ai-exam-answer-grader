from django.db import models


class Exam(models.Model):
    name = models.CharField(max_length=200)
    answer_key = models.JSONField(default=dict, blank=True)
    source = models.CharField(max_length=50, default="answer sheet")
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


class GradedAnswer(models.Model):
    exam = models.ForeignKey(Exam, null=True, blank=True, on_delete=models.SET_NULL, related_name="answers")
    source = models.CharField(max_length=50)
    student_id = models.CharField(max_length=100, blank=True, default="")
    question = models.CharField(max_length=50, blank=True, default="")
    question_text = models.TextField(blank=True, default="")
    answer_text = models.TextField(blank=True, default="")
    pages = models.JSONField(default=list, blank=True)
    ocr_confidence = models.FloatField(null=True, blank=True)
    human_mark = models.FloatField(null=True, blank=True)
    recommended_score = models.FloatField()
    maximum_score = models.FloatField()
    confidence = models.FloatField()
    needs_review = models.BooleanField(default=False)
    result = models.JSONField(default=dict, blank=True)
    teacher_mark = models.FloatField(null=True, blank=True)
    teacher_comment = models.TextField(blank=True, default="")
    reviewed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]

    def final_mark(self):
        if self.teacher_mark is None:
            return self.recommended_score
        return self.teacher_mark

    def __str__(self):
        return str(self.student_id) + " " + str(self.question) + " (" + self.source + ")"
