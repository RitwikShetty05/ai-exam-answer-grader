from django.contrib import admin
from django.urls import path
from grading import views

urlpatterns = [
    path("", views.index),
    path("admin/", admin.site.urls),
    path("api/csrf", views.csrf),
    path("api/status", views.status),
    path("api/examples", views.examples),
    path("api/rubric", views.generate_rubric),
    path("api/grade", views.grade_one),
    path("api/grade-batch", views.grade_batch),
    path("api/scan", views.scan_pages),
    path("api/scan-sample", views.scan_sample),
    path("api/sample-image/<str:name>", views.sample_image),
    path("api/grade-scan", views.grade_scan),
    path("api/answers", views.list_answers),
    path("api/answers/<int:answer_id>/review", views.review_answer),
    path("api/answers/<int:answer_id>/remove-review", views.remove_review),
    path("api/answers/<int:answer_id>/delete", views.delete_answer),
    path("api/answers.csv", views.export_answers),
    path("api/evaluation", views.evaluation),
]
