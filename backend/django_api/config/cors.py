import os

from django.conf import settings
from django.http import HttpResponse


class LocalDevelopmentCorsMiddleware:
    """Allow the local static preview to call the Django API in development."""

    def __init__(self, get_response):
        self.get_response = get_response
        self.allowed = {origin.strip() for origin in os.getenv("CORS_ALLOWED_ORIGINS", "").split(",") if origin.strip()}

    def __call__(self, request):
        origin = request.headers.get("Origin", "")
        local_origin = settings.DEBUG and origin.startswith(("http://localhost:", "http://127.0.0.1:", "https://localhost:", "https://127.0.0.1:"))
        allowed = local_origin or origin in self.allowed
        if request.method == "OPTIONS" and allowed:
            response = HttpResponse(status=204)
        else:
            response = self.get_response(request)
        if allowed:
            response["Access-Control-Allow-Origin"] = origin
            response["Access-Control-Allow-Methods"] = "GET, POST, PUT, PATCH, DELETE, OPTIONS"
            response["Access-Control-Allow-Headers"] = "Authorization, Content-Type"
            response["Vary"] = "Origin"
        return response
