"""Small HS256 JWT helper compatible with the existing Express token claims."""
import base64
import hashlib
import hmac
import json
import time

from django.conf import settings


def _b64(data):
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def issue_token(user):
    now = int(time.time())
    header = _b64(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(",", ":")).encode())
    payload = _b64(json.dumps({
        "userId": user.user_id,
        "email": user.email,
        "role": user.role,
        "iat": now,
        "exp": now + settings.JWT_EXPIRE_SECONDS,
    }, separators=(",", ":")).encode())
    signing_input = f"{header}.{payload}".encode("ascii")
    signature = hmac.new(settings.JWT_SECRET.encode(), signing_input, hashlib.sha256).digest()
    return f"{header}.{payload}.{_b64(signature)}"


def verify_token(token):
    try:
        header, payload, signature = token.split(".")
        decoded_header = json.loads(base64.urlsafe_b64decode((header + "=" * (-len(header) % 4)).encode("ascii")))
        if decoded_header.get("alg") != "HS256":
            raise ValueError("Unsupported token algorithm")
        signing_input = f"{header}.{payload}".encode("ascii")
        expected = hmac.new(settings.JWT_SECRET.encode(), signing_input, hashlib.sha256).digest()
        padded = signature + "=" * (-len(signature) % 4)
        received = base64.urlsafe_b64decode(padded.encode("ascii"))
        if not hmac.compare_digest(expected, received):
            raise ValueError("Bad signature")
        claims = json.loads(base64.urlsafe_b64decode((payload + "=" * (-len(payload) % 4)).encode("ascii")))
        if claims.get("exp", 0) <= time.time() or claims.get("alg") == "none":
            raise ValueError("Expired token")
        return claims
    except (ValueError, TypeError, json.JSONDecodeError) as exc:
        raise ValueError("Invalid or expired token") from exc
