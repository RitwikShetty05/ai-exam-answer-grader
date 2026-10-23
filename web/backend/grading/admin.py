from django.contrib import admin
from .models import Exam, GradedAnswer


@admin.register(Exam)
class ExamAdmin(admin.ModelAdmin):
    list_display = ["name", "source", "created_at"]


@admin.register(GradedAnswer)
class GradedAnswerAdmin(admin.ModelAdmin):
    list_display = ["id", "student_id", "question", "source", "recommended_score", "maximum_score", "confidence", "needs_review", "teacher_mark", "created_at"]
    list_filter = ["source", "needs_review"]
    search_fields = ["student_id", "question", "answer_text"]
