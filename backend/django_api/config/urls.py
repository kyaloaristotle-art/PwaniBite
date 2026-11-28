from django.urls import include, path, re_path
from django.conf import settings
from django.http import FileResponse, Http404, HttpResponsePermanentRedirect
from pathlib import Path
import re


def frontend_file(request, path=""):
    """Serve the existing static site during local development."""
    if not settings.DEBUG:
        raise Http404
    relative = Path(path) if path else Path("index.html")
    # A trailing slash (e.g. /menu.html/) breaks relative asset URLs; send
    # the browser to the canonical path instead of serving the file anyway.
    if path.endswith("/"):
        stripped = path.rstrip("/")
        if stripped and (settings.FRONTEND_ROOT / stripped).is_file():
            return HttpResponsePermanentRedirect("/" + stripped)
    blocked_parts = {"backend", ".git", ".vscode", ".aws", ".codex", ".agents", "node_modules", "__pycache__", ".gitignore"}
    if any(part.lower() in blocked_parts or part.lower().startswith(".env") for part in relative.parts):
        raise Http404
    if any(re.fullmatch(r"package(?:-lock)?\.json", part, re.IGNORECASE) for part in relative.parts):
        raise Http404
    target = (settings.FRONTEND_ROOT / (path or "index.html")).resolve()
    try:
        target.relative_to(settings.FRONTEND_ROOT.resolve())
    except ValueError as exc:
        raise Http404 from exc
    if not target.is_file():
        raise Http404
    return FileResponse(target.open("rb"))


def auth_frontend_file(request, file_name):
    """Serve the public auth and profile pages at their short URLs."""
    target = settings.FRONTEND_ROOT / file_name
    if not target.is_file():
        raise Http404
    return FileResponse(target.open("rb"))


urlpatterns = [
    path("api/", include("ordering.urls")),
    path("login", auth_frontend_file, {"file_name": "login.html"}),
    path("signup", auth_frontend_file, {"file_name": "register.html"}),
    path("profile", auth_frontend_file, {"file_name": "profile.html"}),
    re_path(r"^(?!api/)(?P<path>.*)$", frontend_file),
]
