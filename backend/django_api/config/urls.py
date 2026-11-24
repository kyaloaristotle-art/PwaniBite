from django.urls import include, path, re_path
from django.conf import settings
from django.http import FileResponse, Http404
from pathlib import Path
import re


def frontend_file(request, path=""):
    """Serve the existing static site during local development."""
    if not settings.DEBUG:
        raise Http404
    relative = Path(path) if path else Path("index.html")
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


urlpatterns = [
    path("api/", include("ordering.urls")),
    re_path(r"^(?!api/)(?P<path>.*)$", frontend_file),
]
