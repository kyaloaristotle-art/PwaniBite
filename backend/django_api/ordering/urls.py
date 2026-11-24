from django.urls import path
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from . import views


@api_view(["GET"])
@permission_classes([AllowAny])
def api_root(request):
    return Response({
        "message": "Welcome to Pwani Bite Django API",
        "version": "2.0.0",
        "endpoints": {
            "auth": "/api/auth", "users": "/api/users", "food": "/api/food",
            "orders": "/api/orders", "payments": "/api/payments", "delivery": "/api/delivery",
            "feedback": "/api/feedback", "reports": "/api/reports", "mpesa": "/api/mpesa",
        },
    })


def dual(route, view, name):
    return [path(route, view, name=name), path(f"{route}/", view, name=f"{name}-slash")]


urlpatterns = [path("", api_root, name="api-root")]
urlpatterns += dual("auth/register", views.register, "auth-register")
urlpatterns += dual("auth/login", views.login, "auth-login")
urlpatterns += dual("auth/me", views.current_user, "auth-me")
urlpatterns += dual("users/delivery/list", views.delivery_users, "delivery-users")
urlpatterns += dual("users", views.users_list, "users-list")
urlpatterns += dual("users/<int:user_id>", views.user_detail, "user-detail")
urlpatterns += dual("food/categories/list", views.food_categories, "food-categories")
urlpatterns += dual("food", views.food_collection, "food-list")
urlpatterns += dual("food/<int:food_id>", views.food_detail, "food-detail")
urlpatterns += dual("orders/my-orders", views.my_orders, "my-orders")
urlpatterns += dual("orders/<int:order_id>/status", views.order_status, "order-status")
urlpatterns += dual("orders/<int:order_id>/cancel", views.cancel_order, "order-cancel")
urlpatterns += dual("orders", views.order_collection, "orders-list")
urlpatterns += dual("orders/<int:order_id>", views.order_detail, "order-detail")
urlpatterns += dual("payments/order/<int:order_id>", views.payment_by_order, "payment-by-order")
urlpatterns += dual("payments/<int:payment_id>/status", views.payment_status, "payment-status")
urlpatterns += dual("payments", views.payments_collection, "payments-list")
urlpatterns += dual("delivery/my-deliveries", views.my_deliveries, "my-deliveries")
urlpatterns += dual("delivery/order/<int:order_id>", views.delivery_by_order, "delivery-by-order")
urlpatterns += dual("delivery/assign", views.assign_delivery, "delivery-assign")
urlpatterns += dual("delivery/<int:delivery_id>/status", views.delivery_status, "delivery-status")
urlpatterns += dual("delivery/<int:delivery_id>/notes", views.delivery_notes, "delivery-notes")
urlpatterns += dual("delivery", views.deliveries_list, "delivery-list")
urlpatterns += dual("feedback/order/<int:order_id>", views.feedback_by_order, "feedback-by-order")
urlpatterns += dual("feedback/my-feedback", views.my_feedback, "my-feedback")
urlpatterns += dual("feedback/stats/average", views.feedback_stats, "feedback-stats")
urlpatterns += dual("feedback", views.feedback_collection, "feedback-list")
urlpatterns += dual("reports/sales", views.report_sales, "report-sales")
urlpatterns += dual("reports/popular-items", views.report_popular_items, "report-popular")
urlpatterns += dual("reports/customers", views.report_customers, "report-customers")
urlpatterns += dual("reports/delivery-performance", views.report_delivery_performance, "report-delivery")
urlpatterns += dual("reports/dashboard", views.report_dashboard, "report-dashboard")
urlpatterns += dual("reports/revenue-by-category", views.report_revenue_by_category, "report-revenue")
urlpatterns += dual("reports/hourly-orders", views.report_hourly_orders, "report-hourly")
urlpatterns += dual("mpesa/stkpush", views.mpesa_stk_push, "mpesa-stkpush")
urlpatterns += dual("mpesa/callback", views.mpesa_callback, "mpesa-callback")
urlpatterns += dual("mpesa/status/<int:payment_id>", views.mpesa_payment_status, "mpesa-status")
urlpatterns += dual("mpesa/query", views.mpesa_query, "mpesa-query")
