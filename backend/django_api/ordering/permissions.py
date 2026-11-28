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


def can_manage_canteen(user, canteen_id):
    if not user or not user.is_authenticated:
        return False
    if user.role == "admin":
        return True
    return (
        user.role == "canteen_manager"
        and user.managed_canteen_id is not None
        and str(user.managed_canteen_id) == str(canteen_id)
    )
