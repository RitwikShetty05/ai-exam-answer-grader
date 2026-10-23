import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
WEB_FOLDER = BASE_DIR.parent
SERVICE_FOLDER = WEB_FOLDER.parent
FRONTEND_BUILD = WEB_FOLDER / "frontend" / "dist"

SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "development-only-key-set-DJANGO_SECRET_KEY-when-deploying")
DEBUG = os.environ.get("DJANGO_DEBUG", "1") == "1"

ALLOWED_HOSTS = ["localhost", "127.0.0.1"]
for host in os.environ.get("DJANGO_ALLOWED_HOSTS", "").split(","):
    if host.strip() != "":
        ALLOWED_HOSTS.append(host.strip())

CSRF_TRUSTED_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:8001", "http://127.0.0.1:8001"]

GRADING_API_URL = os.environ.get("GRADING_API_URL", "http://localhost:8000")
DEMO_EXAM_FILE = SERVICE_FOLDER / "data" / "demo exam.json"
UPLOAD_EXAMPLE_FILE = SERVICE_FOLDER / "data" / "group 1 upload example.json"
GROUP1_ANSWER_KEY_FILE = SERVICE_FOLDER / "data" / "group 1 answer key.json"
CHART_SUMMARY_FILE = SERVICE_FOLDER / "results" / "week 6 chart summary.json"
GROUP1_FOLDER = Path(os.environ.get("GROUP1_DIGITIZER_PATH", str(SERVICE_FOLDER.parent / "Group 1 digitizer")))
WEEK7_RESULTS = SERVICE_FOLDER / "results" / "week 7"

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "grading",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "gradersite.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "gradersite.wsgi.application"

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / "db.sqlite3",
    }
}

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "Asia/Kolkata"
USE_I18N = True
USE_TZ = True

STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "static files"
STATICFILES_DIRS = []
if FRONTEND_BUILD.exists():
    STATICFILES_DIRS.append(FRONTEND_BUILD)

DATA_UPLOAD_MAX_MEMORY_SIZE = 25 * 1024 * 1024
FILE_UPLOAD_MAX_MEMORY_SIZE = 25 * 1024 * 1024

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
