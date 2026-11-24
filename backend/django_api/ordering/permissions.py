from rest_framework.permissions import BasePermission


class IsAdmin(BasePermission):
    message = "Admin access required."

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.role == "admin")


class IsCustomer(BasePermission):
    message = "Customer access required."

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.role == "customer")


class IsAdminOrDelivery(BasePermission):
    message = "Admin or delivery access required."

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.role in ("admin", "delivery"))
