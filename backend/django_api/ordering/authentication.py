from rest_framework.authentication import BaseAuthentication, get_authorization_header
from rest_framework.exceptions import AuthenticationFailed

from .models import User
from .tokens import verify_token


class LegacyJWTAuthentication(BaseAuthentication):
    """Read the same Bearer JWT claims used by the existing frontend."""

    def authenticate(self, request):
        parts = get_authorization_header(request).decode("utf-8").split()
        if not parts:
            return None
        if parts[0].lower() != "bearer" or len(parts) != 2:
            raise AuthenticationFailed("Invalid authorization header.")
        try:
            claims = verify_token(parts[1])
            user = User.objects.get(user_id=claims.get("userId"))
        except (User.DoesNotExist, TypeError, ValueError) as exc:
            # Public endpoints and login should remain usable with an expired
            # token left in browser storage; protected endpoints still return 401.
            return None
        return user, parts[1]

    def authenticate_header(self, request):
        return "Bearer"
