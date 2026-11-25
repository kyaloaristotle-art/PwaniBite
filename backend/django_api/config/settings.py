"""Django settings for the PwaniBite API."""
from pathlib import Path
import os

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
BACKEND_DIR = BASE_DIR.parent
PROJECT_ROOT = BACKEND_DIR.parent
load_dotenv(BACKEND_DIR / ".env")

DEBUG = os.getenv("DJANGO_DEBUG", "false").lower() == "true"
SECRET_KEY = os.getenv("DJANGO_SECRET_KEY") or os.getenv("JWT_SECRET")
if not SECRET_KEY:
    if not DEBUG:
        raise RuntimeError("Set DJANGO_SECRET_KEY (and JWT_SECRET if needed) before starting outside debug mode")
    SECRET_KEY = "local-only-change-me"
ALLOWED_HOSTS = [host.strip() for host in os.getenv("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1").split(",") if host.strip()]

INSTALLED_APPS = [
    "rest_framework",
    "ordering",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "config.cors.LocalDevelopmentCorsMiddleware",
    "django.middleware.common.CommonMiddleware",
]

ROOT_URLCONF = "config.urls"
TEMPLATES = []
WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

if os.getenv("DB_ENGINE", "mysql").lower() == "sqlite":
    DATABASES = {"default": {"ENGINE": "django.db.backends.sqlite3", "NAME": os.getenv("SQLITE_PATH", str(BASE_DIR / "pwani_bite.sqlite3"))}}
else:
    import pymysql
    pymysql.install_as_MySQLdb()
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.mysql",
            "NAME": os.getenv("DB_NAME", "pwani_bite"),
            "USER": os.getenv("DB_USER", "root"),
            "PASSWORD": os.getenv("DB_PASSWORD", ""),
            "HOST": os.getenv("DB_HOST", "localhost"),
            "PORT": os.getenv("DB_PORT", "3306"),
            "OPTIONS": {"charset": "utf8mb4"},
            "CONN_MAX_AGE": 60,
        }
    }

DEFAULT_AUTO_FIELD = "django.db.models.AutoField"
USE_TZ = False
TIME_ZONE = os.getenv("TIME_ZONE", "Africa/Nairobi")
LANGUAGE_CODE = "en-us"
STATIC_URL = "/static/"
PASSWORD_HASHERS = ["django.contrib.auth.hashers.BCryptPasswordHasher"]

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": ["ordering.authentication.LegacyJWTAuthentication"],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.AllowAny"],
    "UNAUTHENTICATED_USER": None,
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_THROTTLE_RATES": {"auth": "20/15m"},
}
APPEND_SLASH = False

JWT_SECRET = os.getenv("JWT_SECRET") or SECRET_KEY
if not DEBUG and JWT_SECRET == "local-only-change-me":
    raise RuntimeError("Set a strong JWT_SECRET before starting outside debug mode")
JWT_EXPIRE_SECONDS = int(os.getenv("JWT_EXPIRE_SECONDS", str(7 * 24 * 60 * 60)))
FRONTEND_ROOT = PROJECT_ROOT
