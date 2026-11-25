import json
import os
import re
import secrets
import time
from datetime import datetime, timedelta
from decimal import Decimal, InvalidOperation

from django.conf import settings
from django.contrib.auth.hashers import check_password
from django.db import IntegrityError, transaction
from django.db.models import Avg, Count, F, Q, Sum, ExpressionWrapper, DurationField
from django.db.models.functions import TruncDate, ExtractHour
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from .models import ContactMessage, Delivery, Feedback, Food, Order, OrderItem, Payment, User
from .permissions import IsAdmin, IsAdminOrDelivery, IsCustomer
from .tokens import issue_token
from .throttles import AuthAttemptThrottle


def public_user(user):
    return {
        "user_id": user.user_id, "name": user.name, "email": user.email,
        "phone": user.phone, "hostel": user.hostel, "block": user.block,
        "room": user.room, "role": user.role,
    }


def error(error_message, code=status.HTTP_400_BAD_REQUEST, **extra):
    return Response({"error": error_message, **extra}, status=code)


def serialize_food(food):
    return {
        "food_id": food.food_id, "food_name": food.food_name,
        "description": food.description, "price": food.price,
        "image": food.image, "category": food.category,
        "availability": food.availability, "stock_quantity": food.stock_quantity,
        "created_at": food.created_at, "updated_at": food.updated_at,
    }


def serialize_item(item):
    return {
        "order_item_id": item.order_item_id, "order_id": item.order_id,
        "food_id": item.food_id, "food_name": item.food.food_name,
        "quantity": item.quantity, "price": item.price, "subtotal": item.subtotal,
    }


def serialize_order(order, include_customer=False):
    data = {
        "order_id": order.order_id, "order_number": order.order_number,
        "user_id": order.user_id, "order_date": order.order_date,
        "total_amount": order.total_amount, "delivery_location": order.delivery_location,
        "hostel": order.hostel, "block": order.block, "room": order.room,
        "delivery_time": order.delivery_time, "special_instructions": order.special_instructions,
        "order_status": order.order_status,
        "items": [serialize_item(item) for item in order.items.select_related("food").all()],
    }
    if include_customer:
        data["customer_name"] = order.user.name
        data["customer_phone"] = order.user.phone
    return data


def parse_date(value):
    try:
        return datetime.strptime(value, "%Y-%m-%d").date() if value else None
    except ValueError:
        return None


def parse_food_payload(body, food=None):
    """Validate and normalize fields accepted by food create/update endpoints."""
    fields = {}
    for key in ("food_name", "description", "price", "category", "availability", "stock_quantity", "image"):
        if key in body:
            fields[key] = body[key]
    if food is None and not all(fields.get(key) not in (None, "") for key in ("food_name", "price", "category")):
        raise ValueError("Food name, price, and category are required")
    if "food_name" in fields:
        fields["food_name"] = str(fields["food_name"]).strip()
        if not 1 <= len(fields["food_name"]) <= 100:
            raise ValueError("Food name must be between 1 and 100 characters")
    if "category" in fields:
        fields["category"] = str(fields["category"]).strip()
        if not 1 <= len(fields["category"]) <= 50:
            raise ValueError("Category must be between 1 and 50 characters")
    if "price" in fields:
        fields["price"] = Decimal(str(fields["price"]))
        if not fields["price"].is_finite() or fields["price"] <= 0 or fields["price"].as_tuple().exponent < -2:
            raise ValueError("Price must be positive with at most two decimal places")
    if "stock_quantity" in fields:
        value = fields["stock_quantity"]
        if isinstance(value, bool) or str(value).strip() != str(int(value)) or int(value) < 0:
            raise ValueError("Stock quantity must be a non-negative whole number")
        fields["stock_quantity"] = int(value)
    if "availability" in fields and not isinstance(fields["availability"], bool):
        raise ValueError("Availability must be true or false")
    for key, limit in (("description", None), ("image", 255)):
        if key in fields and fields[key] is not None:
            fields[key] = str(fields[key])
            if limit and len(fields[key]) > limit:
                raise ValueError(f"{key.title()} is too long")
    return fields


def hash_password(raw_password):
    # Keep bcrypt hashes in the same format used by the former Node API.
    import bcrypt
    return bcrypt.hashpw(raw_password.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("ascii")


def verify_password(raw_password, encoded_password):
    if encoded_password.startswith(("$2a$", "$2b$", "$2y$")):
        try:
            import bcrypt
            return bcrypt.checkpw(raw_password.encode("utf-8"), encoded_password.encode("ascii"))
        except (ImportError, ValueError, TypeError):
            return False
    return check_password(raw_password, encoded_password)


@api_view(["POST"])
@permission_classes([AllowAny])
@throttle_classes([AuthAttemptThrottle])
def register(request):
    body = request.data
    name = str(body.get("name", "")).strip()
    email = str(body.get("email", "")).strip().lower()
    phone = str(body.get("phone", "")).strip()
    password = str(body.get("password", ""))
    if len(name) < 2:
        return error("Name must be at least 2 characters")
    if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email):
        return error("Valid email required")
    if not re.fullmatch(r"(?:07|01)\d{8}", phone):
        return error("Invalid Kenyan phone number")
    if len(password) < 6:
        return error("Password must be at least 6 characters")
    if User.objects.filter(Q(email=email) | Q(phone=phone)).exists():
        return error("A user with this email or phone number already exists", status.HTTP_409_CONFLICT)
    user = User(
        name=name, email=email, phone=phone, password=hash_password(password), role="customer",
        hostel=str(body.get("hostel", "")).strip() or None,
        block=str(body.get("block", "")).strip() or None,
        room=str(body.get("room", "")).strip() or None,
    )
    try:
        user.save(force_insert=True)
    except IntegrityError:
        return error("A user with this email or phone number already exists", status.HTTP_409_CONFLICT)
    return Response({"message": "User registered successfully", "token": issue_token(user), "user": public_user(user)}, status=status.HTTP_201_CREATED)


@api_view(["POST"])
@permission_classes([AllowAny])
@throttle_classes([AuthAttemptThrottle])
def login(request):
    email = str(request.data.get("email", "")).strip().lower()
    password = str(request.data.get("password", ""))
    if not email or not password:
        return error("Valid email and password required")
    user = User.objects.filter(email=email).first()
    if not user or not verify_password(password, user.password):
        return error("Invalid email or password", status.HTTP_401_UNAUTHORIZED)
    return Response({"message": "Login successful", "token": issue_token(user), "user": public_user(user)})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def current_user(request):
    return Response({"user": public_user(request.user) | {"created_at": request.user.created_at}})


@api_view(["GET"])
@permission_classes([AllowAny])
def food_categories(request):
    return Response({"categories": list(Food.objects.order_by("category").values_list("category", flat=True).distinct())})


@api_view(["POST"])
def food_image_upload(request):
    if not request.user or not request.user.is_authenticated or request.user.role != "admin":
        return error("Admin access required", status.HTTP_403_FORBIDDEN)
    uploaded = request.FILES.get("image")
    if not uploaded:
        return error("Choose an image to upload")
    allowed = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif"}
    content_type = getattr(uploaded, "content_type", "")
    if content_type not in allowed or uploaded.size > 5 * 1024 * 1024:
        return error("Use a JPG, PNG, WebP, or GIF image up to 5 MB")
    filename = f"{secrets.token_hex(16)}{allowed[content_type]}"
    relative_path = f"Images/uploads/{filename}"
    target = settings.FRONTEND_ROOT / relative_path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(uploaded.read())
    return Response({"image": relative_path.replace("\\", "/")}, status=status.HTTP_201_CREATED)


@api_view(["GET", "POST"])
def food_collection(request):
    if request.method == "GET":
        foods = Food.objects.all()
        if request.query_params.get("category"):
            foods = foods.filter(category=request.query_params["category"])
        available = request.query_params.get("available")
        if available is not None:
            foods = foods.filter(availability=(available.lower() == "true"))
        return Response({"food": [serialize_food(food) for food in foods.order_by("food_name")]})
    if not request.user or not request.user.is_authenticated or request.user.role != "admin":
        return error("Admin access required", status.HTTP_403_FORBIDDEN)
    body = request.data
    try:
        fields = parse_food_payload(body)
        fields.setdefault("description", "")
        fields.setdefault("availability", True)
        fields.setdefault("stock_quantity", 0)
        food = Food.objects.create(**fields)
    except (InvalidOperation, TypeError, ValueError, OverflowError) as exc:
        return error(str(exc) or "Invalid food item data")
    return Response({"message": "Food item added successfully", "food_id": food.food_id}, status=status.HTTP_201_CREATED)


@api_view(["GET", "PUT", "DELETE"])
def food_detail(request, food_id):
    food = Food.objects.filter(food_id=food_id).first()
    if not food:
        return error("Food item not found", status.HTTP_404_NOT_FOUND)
    if request.method == "GET":
        return Response({"food": serialize_food(food)})
    if not request.user or not request.user.is_authenticated or request.user.role != "admin":
        return error("Admin access required", status.HTTP_403_FORBIDDEN)
    if request.method == "DELETE":
        if OrderItem.objects.filter(food_id=food_id).exists():
            return error("Food item is part of an order and cannot be deleted", status.HTTP_409_CONFLICT)
        food.delete()
        return Response({"message": "Food item deleted successfully"})
    body = request.data
    try:
        fields = parse_food_payload(body, food)
        for field, value in fields.items():
            setattr(food, field, value)
        food.save()
    except (InvalidOperation, TypeError, ValueError, OverflowError) as exc:
        return error(str(exc) or "Invalid food item data")
    return Response({"message": "Food item updated successfully"})


@api_view(["GET", "POST"])
def order_collection(request):
    if not request.user or not request.user.is_authenticated:
        return error("Authentication required", status.HTTP_401_UNAUTHORIZED)
    if request.method == "GET":
        if request.user.role != "admin":
            return error("Admin access required", status.HTTP_403_FORBIDDEN)
        orders = Order.objects.select_related("user").all().order_by("-order_date")
        if request.query_params.get("status"):
            orders = orders.filter(order_status=request.query_params["status"])
        start, end = parse_date(request.query_params.get("start_date")), parse_date(request.query_params.get("end_date"))
        if start:
            orders = orders.filter(order_date__date__gte=start)
        if end:
            orders = orders.filter(order_date__date__lte=end)
        return Response({"orders": [serialize_order(order, True) for order in orders]})

    if request.user.role != "customer":
        return error("Customer access required", status.HTTP_403_FORBIDDEN)
    body = request.data
    items = body.get("items")
    if not isinstance(items, list) or not items:
        return error("Order must contain at least one item")
    for field in ("delivery_location", "hostel", "block", "room"):
        if not str(body.get(field, "")).strip():
            return error(f"{field.replace('_', ' ').title()} is required")

    parsed_items = []
    needed = {}
    for item in items:
        try:
            quantity = int(item.get("quantity"))
            if quantity < 1 or str(quantity) != str(item.get("quantity")):
                return error("Each item quantity must be a positive whole number")
        except (AttributeError, TypeError, ValueError):
            return error("Each item quantity must be a positive whole number")
        food_id = item.get("food_id")
        food_name = item.get("food_name") or item.get("name")
        if food_id:
            food = Food.objects.filter(food_id=food_id).first()
        elif food_name:
            food = Food.objects.filter(food_name=food_name).first()
        else:
            food = None
        if not food:
            return error("One or more items are not available in the menu")
        needed[food.food_id] = needed.get(food.food_id, 0) + quantity
        parsed_items.append((food.food_id, quantity))

    with transaction.atomic():
        locked_foods = {
            food.food_id: food
            for food in Food.objects.select_for_update().filter(food_id__in=sorted(needed)).order_by("food_id")
        }
        if len(locked_foods) != len(needed):
            return error("One or more items are not available in the menu")
        for food_id, quantity in needed.items():
            food = locked_foods[food_id]
            if not food.availability or (food.stock_quantity is not None and food.stock_quantity < quantity):
                return error(f'Sorry, "{food.food_name}" is out of stock or does not have enough quantity.', status.HTTP_409_CONFLICT)

        total = Decimal("0.00")
        order_number = f"PB{int(time.time() * 1000) % 1_000_000:06d}{secrets.randbelow(90) + 10}"
        order = Order.objects.create(
            order_number=order_number, user=request.user, total_amount=0,
            delivery_location=str(body["delivery_location"]).strip(),
            hostel=str(body["hostel"]).strip(), block=str(body["block"]).strip(),
            room=str(body["room"]).strip(), delivery_time=body.get("delivery_time"),
            special_instructions=body.get("special_instructions", ""), order_status="Pending",
        )
        for food_id, quantity in parsed_items:
            food = locked_foods[food_id]
            subtotal = food.price * quantity
            total += subtotal
            OrderItem.objects.create(order=order, food=food, quantity=quantity, price=food.price, subtotal=subtotal)
        order.total_amount = total
        order.save(update_fields=["total_amount", "updated_at"])
        for food_id, quantity in needed.items():
            food = locked_foods[food_id]
            if food.stock_quantity is not None:
                food.stock_quantity -= quantity
                if food.stock_quantity <= 0:
                    food.availability = False
                food.save(update_fields=["stock_quantity", "availability", "updated_at"])

    return Response({
        "message": "Order created successfully", "order_id": order.order_id,
        "order_number": order.order_number, "total_amount": order.total_amount,
    }, status=status.HTTP_201_CREATED)


@api_view(["GET"])
@permission_classes([IsCustomer])
def my_orders(request):
    orders = Order.objects.filter(user_id=request.user.user_id).order_by("-order_date")
    return Response({"orders": [serialize_order(order) for order in orders]})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def order_detail(request, order_id):
    order = Order.objects.filter(order_id=order_id).select_related("user").first()
    if not order:
        return error("Order not found", status.HTTP_404_NOT_FOUND)
    if request.user.role != "admin" and order.user_id != request.user.user_id:
        return error("You are not authorized to view this order", status.HTTP_403_FORBIDDEN)
    return Response({"order": serialize_order(order, request.user.role == "admin")})


@api_view(["PUT"])
@permission_classes([IsAdmin])
def order_status(request, order_id):
    order = Order.objects.filter(order_id=order_id).first()
    if not order:
        return error("Order not found", status.HTTP_404_NOT_FOUND)
    new_status = request.data.get("order_status")
    if new_status not in Order.STATUSES:
        return error("Invalid order status")
    order.order_status = new_status
    order.save(update_fields=["order_status", "updated_at"])
    return Response({"message": "Order status updated successfully"})


@api_view(["PUT"])
@permission_classes([IsCustomer])
def cancel_order(request, order_id):
    with transaction.atomic():
        order = Order.objects.select_for_update().filter(order_id=order_id, user_id=request.user.user_id).first()
        if not order:
            return error("Order not found", status.HTTP_404_NOT_FOUND)
        if order.order_status != "Pending":
            return error("Only pending orders can be cancelled", status.HTTP_400_BAD_REQUEST)
        order.order_status = "Cancelled"
        order.save(update_fields=["order_status", "updated_at"])
        items = list(order.items.select_related("food").all())
        for item in items:
            food = Food.objects.select_for_update().filter(food_id=item.food_id).first()
            if food and food.stock_quantity is not None:
                food.stock_quantity += item.quantity
                food.availability = food.stock_quantity > 0
                food.save(update_fields=["stock_quantity", "availability", "updated_at"])
    return Response({"message": "Order cancelled successfully"})


@api_view(["GET"])
@permission_classes([IsAdmin])
def users_list(request):
    users = User.objects.order_by("-created_at")
    return Response({"users": [public_user(user) | {"created_at": user.created_at} for user in users]})


@api_view(["GET"])
@permission_classes([IsAdmin])
def delivery_users(request):
    users = User.objects.filter(role="delivery").order_by("name")
    return Response({"users": [{"user_id": user.user_id, "name": user.name, "email": user.email, "phone": user.phone} for user in users]})


@api_view(["GET", "PUT", "DELETE"])
@permission_classes([IsAdmin])
def user_detail(request, user_id):
    user = User.objects.filter(user_id=user_id).first()
    if not user:
        return error("User not found", status.HTTP_404_NOT_FOUND)
    if request.method == "GET":
        return Response({"user": public_user(user) | {"created_at": user.created_at}})
    if request.method == "DELETE":
        if user.user_id == request.user.user_id:
            return error("You cannot delete your own account", status.HTTP_400_BAD_REQUEST)
        user.delete()
        return Response({"message": "User deleted successfully"})
    body = request.data
    role = body.get("role", user.role)
    if role not in ("customer", "admin", "delivery", "staff"):
        return error("Invalid user role")
    for field in ("name", "email", "phone", "hostel", "block", "room"):
        if field in body:
            setattr(user, field, body[field])
    user.role = role
    try:
        user.save()
    except IntegrityError:
        return error("Email or phone number is already in use", status.HTTP_409_CONFLICT)
    return Response({"message": "User updated successfully"})


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def payments_collection(request):
    if request.method == "GET":
        if request.user.role != "admin":
            return error("Admin access required", status.HTTP_403_FORBIDDEN)
        payments = Payment.objects.select_related("order").order_by("-payment_date")
        if request.query_params.get("status"):
            payments = payments.filter(payment_status=request.query_params["status"])
        start, end = parse_date(request.query_params.get("start_date")), parse_date(request.query_params.get("end_date"))
        if start:
            payments = payments.filter(payment_date__date__gte=start)
        if end:
            payments = payments.filter(payment_date__date__lte=end)
        return Response({"payments": [{
            "payment_id": p.payment_id, "order_id": p.order_id, "order_number": p.order.order_number,
            "order_total": p.order.total_amount, "payment_method": p.payment_method,
            "amount": p.amount, "payment_status": p.payment_status,
            "transaction_id": p.transaction_id, "payment_date": p.payment_date,
        } for p in payments]})

    body = request.data
    if body.get("payment_method") != "Cash":
        return error("Use the M-Pesa checkout flow for M-Pesa payments.")
    try:
        with transaction.atomic():
            order = Order.objects.select_for_update().filter(order_id=body.get("order_id")).first()
            if not order:
                return error("Order not found", status.HTTP_404_NOT_FOUND)
            if request.user.role != "admin" and order.user_id != request.user.user_id:
                return error("You are not authorized to record payment for this order", status.HTTP_403_FORBIDDEN)
            if order.order_status == "Cancelled":
                return error("A cancelled order cannot be paid.")
            if Payment.objects.filter(order_id=order.order_id).exists():
                return error("This order already has a payment record", status.HTTP_409_CONFLICT)
            payment = Payment.objects.create(order=order, payment_method="Cash", amount=order.total_amount, payment_status="Pending")
    except IntegrityError:
        return error("This order already has a payment record", status.HTTP_409_CONFLICT)
    return Response({"message": "Payment recorded successfully", "payment_id": payment.payment_id}, status=status.HTTP_201_CREATED)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def payment_by_order(request, order_id):
    payment = Payment.objects.filter(order_id=order_id).select_related("order").first()
    if not payment:
        return error("Payment not found", status.HTTP_404_NOT_FOUND)
    if request.user.role != "admin" and payment.order.user_id != request.user.user_id:
        return error("You are not authorized to view this payment", status.HTTP_403_FORBIDDEN)
    return Response({"payment": {
        "payment_id": payment.payment_id, "order_id": payment.order_id,
        "payment_method": payment.payment_method, "amount": payment.amount,
        "payment_status": payment.payment_status, "transaction_id": payment.transaction_id,
        "payment_date": payment.payment_date,
    }})


@api_view(["PUT"])
@permission_classes([IsAdmin])
def payment_status(request, payment_id):
    payment = Payment.objects.filter(payment_id=payment_id).first()
    if not payment:
        return error("Payment not found", status.HTTP_404_NOT_FOUND)
    new_status = request.data.get("payment_status")
    if new_status not in Payment.STATUSES:
        return error("Invalid payment status")
    payment.payment_status = new_status
    payment.save(update_fields=["payment_status"])
    return Response({"message": "Payment status updated successfully"})


def serialize_delivery(delivery, details=False):
    data = {
        "delivery_id": delivery.delivery_id, "order_id": delivery.order_id,
        "delivery_person_id": delivery.delivery_person_id, "location": delivery.location,
        "delivery_status": delivery.delivery_status, "assigned_at": delivery.assigned_at,
        "picked_up_at": delivery.picked_up_at, "delivered_at": delivery.delivered_at,
        "notes": delivery.notes, "created_at": delivery.created_at,
    }
    if delivery.delivery_person:
        data["delivery_person_name"] = delivery.delivery_person.name
    if details:
        order = delivery.order
        data.update({
            "order_number": order.order_number, "order_status": order.order_status,
            "hostel": order.hostel, "block": order.block, "room": order.room,
            "delivery_location": order.delivery_location,
            "customer_name": order.user.name, "customer_phone": order.user.phone,
        })
    return data


@api_view(["GET"])
@permission_classes([IsAdmin])
def deliveries_list(request):
    deliveries = Delivery.objects.select_related("order", "delivery_person", "order__user").all()
    if request.query_params.get("status"):
        deliveries = deliveries.filter(delivery_status=request.query_params["status"])
    start, end = parse_date(request.query_params.get("start_date")), parse_date(request.query_params.get("end_date"))
    if start:
        deliveries = deliveries.filter(created_at__date__gte=start)
    if end:
        deliveries = deliveries.filter(created_at__date__lte=end)
    return Response({"deliveries": [serialize_delivery(d, True) for d in deliveries.order_by("-created_at")]})


@api_view(["GET"])
@permission_classes([IsAdminOrDelivery])
def my_deliveries(request):
    deliveries = Delivery.objects.select_related("order", "delivery_person", "order__user").filter(delivery_person_id=request.user.user_id).order_by("-created_at")
    return Response({"deliveries": [serialize_delivery(d, True) for d in deliveries]})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def delivery_by_order(request, order_id):
    delivery = Delivery.objects.select_related("order", "delivery_person", "order__user").filter(order_id=order_id).first()
    if not delivery:
        return error("Delivery not found", status.HTTP_404_NOT_FOUND)
    if request.user.role != "admin" and delivery.delivery_person_id != request.user.user_id and delivery.order.user_id != request.user.user_id:
        return error("You are not authorized to view this delivery", status.HTTP_403_FORBIDDEN)
    return Response({"delivery": serialize_delivery(delivery)})


@api_view(["POST"])
@permission_classes([IsAdmin])
def assign_delivery(request):
    order = Order.objects.filter(order_id=request.data.get("order_id")).first()
    if not order:
        return error("Order not found", status.HTTP_404_NOT_FOUND)
    person = User.objects.filter(user_id=request.data.get("delivery_person_id"), role="delivery").first()
    if not person:
        return error("Delivery personnel not found", status.HTTP_404_NOT_FOUND)
    delivery, _ = Delivery.objects.update_or_create(
        order=order,
        defaults={"delivery_person": person, "delivery_status": "Assigned", "assigned_at": timezone.now(), "location": order.delivery_location},
    )
    return Response({"message": "Delivery assigned successfully", "delivery_id": delivery.delivery_id})


@api_view(["PUT"])
@permission_classes([IsAdminOrDelivery])
def delivery_status(request, delivery_id):
    delivery = Delivery.objects.filter(delivery_id=delivery_id).first()
    if not delivery:
        return error("Delivery not found", status.HTTP_404_NOT_FOUND)
    if request.user.role != "admin" and delivery.delivery_person_id != request.user.user_id:
        return error("You are not assigned to this delivery", status.HTTP_403_FORBIDDEN)
    new_status = request.data.get("delivery_status")
    if new_status not in Delivery.STATUSES:
        return error("Invalid delivery status")
    delivery.delivery_status = new_status
    updates = ["delivery_status", "updated_at"]
    if new_status == "Picked Up":
        delivery.picked_up_at = timezone.now()
        updates.append("picked_up_at")
    elif new_status == "Delivered":
        delivery.delivered_at = timezone.now()
        updates.append("delivered_at")
        Order.objects.filter(order_id=delivery.order_id).update(order_status="Delivered", updated_at=timezone.now())
    delivery.save(update_fields=updates)
    return Response({"message": "Delivery status updated successfully"})


@api_view(["PUT"])
@permission_classes([IsAdminOrDelivery])
def delivery_notes(request, delivery_id):
    delivery = Delivery.objects.filter(delivery_id=delivery_id).first()
    if not delivery:
        return error("Delivery not found", status.HTTP_404_NOT_FOUND)
    if request.user.role != "admin" and delivery.delivery_person_id != request.user.user_id:
        return error("You are not assigned to this delivery", status.HTTP_403_FORBIDDEN)
    delivery.notes = request.data.get("notes", "")
    delivery.save(update_fields=["notes", "updated_at"])
    return Response({"message": "Delivery notes updated successfully"})


def serialize_feedback(feedback, details=False):
    data = {
        "feedback_id": feedback.feedback_id, "user_id": feedback.user_id,
        "order_id": feedback.order_id, "food_rating": feedback.food_rating,
        "delivery_rating": feedback.delivery_rating, "overall_rating": feedback.overall_rating,
        "recommend": feedback.recommend, "comments": feedback.comments,
        "created_at": feedback.created_at,
    }
    if details:
        data["customer_name"] = feedback.user.name
        data["order_number"] = feedback.order.order_number
    return data


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def feedback_collection(request):
    if request.method == "GET":
        if request.user.role != "admin":
            return error("Admin access required", status.HTTP_403_FORBIDDEN)
        feedback = Feedback.objects.select_related("user", "order").order_by("-created_at")
        return Response({"feedback": [serialize_feedback(f, True) for f in feedback]})
    if request.user.role != "customer":
        return error("Customer access required", status.HTTP_403_FORBIDDEN)
    body = request.data
    order = Order.objects.filter(order_id=body.get("order_id"), user_id=request.user.user_id).first()
    if not order:
        return error("Order not found", status.HTTP_404_NOT_FOUND)
    if Feedback.objects.filter(order_id=order.order_id).exists():
        return error("You have already submitted feedback for this order", status.HTTP_409_CONFLICT)
    ratings = [body.get(field) for field in ("food_rating", "delivery_rating", "overall_rating")]
    try:
        ratings = [int(value) if value is not None else None for value in ratings]
        if any(value is not None and not 1 <= value <= 5 for value in ratings):
            raise ValueError
    except (TypeError, ValueError):
        return error("Ratings must be whole numbers from 1 to 5")
    feedback = Feedback.objects.create(
        user=request.user, order=order, food_rating=ratings[0], delivery_rating=ratings[1],
        overall_rating=ratings[2], recommend=body.get("recommend"), comments=body.get("comments", ""),
    )
    return Response({"message": "Feedback submitted successfully", "feedback_id": feedback.feedback_id}, status=status.HTTP_201_CREATED)


@api_view(["GET"])
@permission_classes([IsAdmin])
def feedback_stats(request):
    stats = Feedback.objects.aggregate(
        avg_food_rating=Avg("food_rating"), avg_delivery_rating=Avg("delivery_rating"),
        avg_overall_rating=Avg("overall_rating"), total_feedback=Count("feedback_id"),
        would_recommend=Count("feedback_id", filter=Q(recommend=True)),
    )
    return Response({"stats": stats})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def feedback_by_order(request, order_id):
    feedback = Feedback.objects.select_related("order").filter(order_id=order_id).first()
    if not feedback:
        return error("Feedback not found", status.HTTP_404_NOT_FOUND)
    if request.user.role != "admin" and feedback.order.user_id != request.user.user_id:
        return error("You are not authorized to view this feedback", status.HTTP_403_FORBIDDEN)
    return Response({"feedback": serialize_feedback(feedback)})


@api_view(["GET"])
@permission_classes([IsCustomer])
def my_feedback(request):
    feedback = Feedback.objects.select_related("order").filter(user_id=request.user.user_id).order_by("-created_at")
    return Response({"feedback": [serialize_feedback(f) | {"order_number": f.order.order_number} for f in feedback]})


@api_view(["GET"])
@permission_classes([IsAdmin])
def report_sales(request):
    orders = Order.objects.exclude(order_status="Cancelled")
    start, end = parse_date(request.query_params.get("start_date")), parse_date(request.query_params.get("end_date"))
    if start:
        orders = orders.filter(order_date__date__gte=start)
    if end:
        orders = orders.filter(order_date__date__lte=end)
    sales = orders.annotate(sale_date=TruncDate("order_date")).values("sale_date").annotate(
        total_orders=Count("order_id"), total_sales=Sum("total_amount"), average_order_value=Avg("total_amount"),
    ).order_by("-sale_date")
    return Response({"sales": list(sales)})


@api_view(["GET"])
@permission_classes([IsAdmin])
def report_popular_items(request):
    try:
        limit = max(1, min(int(request.query_params.get("limit", 10)), 100))
    except ValueError:
        limit = 10
    items = OrderItem.objects.filter(order__order_status__in=["Pending", "Preparing", "Out for Delivery", "Delivered"]).values(
        "food__food_name", "food__category"
    ).annotate(total_ordered=Sum("quantity"), total_revenue=Sum("subtotal")).order_by("-total_ordered")[:limit]
    return Response({"items": [{
        "food_name": row["food__food_name"], "category": row["food__category"],
        "total_ordered": row["total_ordered"], "total_revenue": row["total_revenue"],
    } for row in items]})


@api_view(["GET"])
@permission_classes([IsAdmin])
def report_customers(request):
    users = User.objects.filter(role="customer").annotate(
        total_orders=Count("orders", distinct=True), total_spent=Sum("orders__total_amount"),
    ).order_by("-total_orders")
    return Response({"customers": [{
        "user_id": user.user_id, "name": user.name, "email": user.email, "phone": user.phone,
        "hostel": user.hostel, "total_orders": user.total_orders, "total_spent": user.total_spent,
    } for user in users]})


@api_view(["GET"])
@permission_classes([IsAdmin])
def report_delivery_performance(request):
    staff = User.objects.filter(role="delivery", assigned_deliveries__delivery_status="Delivered").annotate(
        total_deliveries=Count("assigned_deliveries__delivery_id"),
        avg_delivery_time=Avg(ExpressionWrapper(F("assigned_deliveries__delivered_at") - F("assigned_deliveries__assigned_at"), output_field=DurationField())),
    ).order_by("-total_deliveries")
    return Response({"performance": [{
        "delivery_person": user.name, "total_deliveries": user.total_deliveries,
        "successful_deliveries": user.total_deliveries,
        "avg_delivery_time_minutes": (user.avg_delivery_time.total_seconds() / 60 if user.avg_delivery_time else None),
    } for user in staff]})


@api_view(["GET"])
@permission_classes([IsAdmin])
def report_dashboard(request):
    orders = Order.objects.all()
    order_stats = {
        "total_orders": orders.count(),
        "pending_orders": orders.filter(order_status="Pending").count(),
        "preparing_orders": orders.filter(order_status="Preparing").count(),
        "out_for_delivery": orders.filter(order_status="Out for Delivery").count(),
        "delivered_orders": orders.filter(order_status="Delivered").count(),
        "cancelled_orders": orders.filter(order_status="Cancelled").count(),
        "total_sales": orders.aggregate(value=Sum("total_amount"))["value"],
    }
    users = User.objects.all()
    user_stats = {
        "total_users": users.count(), "customers": users.filter(role="customer").count(),
        "delivery_personnel": users.filter(role="delivery").count(), "admins": users.filter(role="admin").count(),
    }
    food_stats = {
        "total_food_items": Food.objects.count(), "available_items": Food.objects.filter(availability=True).count(),
        "total_stock": Food.objects.aggregate(value=Sum("stock_quantity"))["value"],
    }
    today = timezone.now().date()
    today_orders = orders.filter(order_date__date=today)
    month_orders = orders.filter(order_date__year=today.year, order_date__month=today.month)
    today_stats = {"today_orders": today_orders.count(), "today_sales": today_orders.aggregate(value=Sum("total_amount"))["value"]}
    month_stats = {"month_orders": month_orders.count(), "month_sales": month_orders.aggregate(value=Sum("total_amount"))["value"]}
    return Response({"orders": order_stats, "users": user_stats, "food": food_stats, "today": today_stats, "month": month_stats})


@api_view(["GET"])
@permission_classes([IsAdmin])
def report_revenue_by_category(request):
    items = OrderItem.objects.exclude(order__order_status="Cancelled")
    start, end = parse_date(request.query_params.get("start_date")), parse_date(request.query_params.get("end_date"))
    if start:
        items = items.filter(order__order_date__date__gte=start)
    if end:
        items = items.filter(order__order_date__date__lte=end)
    rows = items.values("food__category").annotate(total_items=Sum("quantity"), total_revenue=Sum("subtotal")).order_by("-total_revenue")
    return Response({"revenue": [{"category": row["food__category"], "total_items": row["total_items"], "total_revenue": row["total_revenue"]} for row in rows]})


@api_view(["GET"])
@permission_classes([IsAdmin])
def report_hourly_orders(request):
    selected = parse_date(request.query_params.get("date")) or timezone.now().date()
    rows = Order.objects.filter(order_date__date=selected).annotate(hour=ExtractHour("order_date")).values("hour").annotate(order_count=Count("order_id")).order_by("hour")
    return Response({"hourly": list(rows)})


def mpesa_access_token():
    import requests
    consumer_key = os.getenv("MPESA_CONSUMER_KEY", "")
    consumer_secret = os.getenv("MPESA_CONSUMER_SECRET", "")
    if not consumer_key or not consumer_secret:
        raise RuntimeError("M-Pesa credentials are not configured")
    base = "https://api.safaricom.co.ke" if os.getenv("MPESA_ENVIRONMENT", "sandbox") == "production" else "https://sandbox.safaricom.co.ke"
    response = requests.get(f"{base}/oauth/v1/generate?grant_type=client_credentials", auth=(consumer_key, consumer_secret), timeout=15)
    response.raise_for_status()
    return response.json()["access_token"], base


@api_view(["POST"])
@permission_classes([IsCustomer])
def mpesa_stk_push(request):
    import requests
    body = request.data
    order = Order.objects.filter(order_id=body.get("order_id"), user_id=request.user.user_id).first()
    if not order:
        return error("Order not found", status.HTTP_404_NOT_FOUND)
    try:
        amount = Decimal(str(body.get("amount")))
    except (InvalidOperation, TypeError):
        return error("Invalid payment amount")
    if amount != order.total_amount:
        return error("Payment amount does not match order total")
    if amount != amount.to_integral_value():
        return error("M-Pesa payments must be a whole number of shillings")
    if order.order_status == "Cancelled":
        return error("A cancelled order cannot be paid.")
    raw_phone = str(body.get("phone_number", "")).strip().replace(" ", "")
    if raw_phone.startswith("+"):
        raw_phone = raw_phone[1:]
    if raw_phone.startswith("0"):
        raw_phone = "254" + raw_phone[1:]
    if not re.fullmatch(r"254\d{9}", raw_phone):
        return error("Phone number must be in format 254XXXXXXXXX")
    try:
        access_token, base = mpesa_access_token()
        shortcode = os.getenv("MPESA_SHORTCODE", "")
        passkey = os.getenv("MPESA_PASSKEY", "")
        server_url = os.getenv("SERVER_URL", "http://localhost:8000").rstrip("/")
        timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
        import base64
        password = base64.b64encode(f"{shortcode}{passkey}{timestamp}".encode()).decode()
        payload = {
            "BusinessShortCode": shortcode, "Password": password, "Timestamp": timestamp,
            "TransactionType": "CustomerPayBillOnline", "Amount": int(amount),
            "PartyA": raw_phone, "PartyB": shortcode, "PhoneNumber": raw_phone,
            "CallBackURL": f"{server_url}/api/mpesa/callback",
            "AccountReference": f"PB{order.order_number}",
            "TransactionDesc": f"Payment for order {order.order_number}",
        }
        response = requests.post(f"{base}/mpesa/stkpush/v1/processrequest", json=payload, headers={
            "Authorization": f"Bearer {access_token}", "Content-Type": "application/json",
        }, timeout=25)
        response.raise_for_status()
        provider = response.json()
        checkout_id = provider.get("CheckoutRequestID")
        if not checkout_id:
            return error(provider.get("errorMessage") or provider.get("ResponseDescription") or "M-Pesa did not accept the payment request", status.HTTP_502_BAD_GATEWAY)
        try:
            with transaction.atomic():
                locked_order = Order.objects.select_for_update().get(order_id=order.order_id)
                if Payment.objects.filter(order_id=order.order_id).exists():
                    return error("This order already has a payment record", status.HTTP_409_CONFLICT)
                payment = Payment.objects.create(order=locked_order, payment_method="M-Pesa", amount=order.total_amount,
                                                 payment_status="Pending", transaction_id=checkout_id)
        except (IntegrityError, Order.DoesNotExist):
            return error("This order already has a payment record", status.HTTP_409_CONFLICT)
        return Response({
            "message": "STK Push initiated successfully", "merchant_request_id": provider.get("MerchantRequestID"),
            "checkout_request_id": checkout_id,
            "customer_message": "Please enter your M-Pesa PIN on your phone to complete the payment",
            "payment_id": payment.payment_id,
        })
    except (requests.RequestException, KeyError, ValueError, RuntimeError) as exc:
        return error("Failed to initiate STK Push", status.HTTP_502_BAD_GATEWAY, message=str(exc))


@api_view(["POST"])
@permission_classes([AllowAny])
def mpesa_callback(request):
    try:
        callback = request.data["Body"]["stkCallback"]
        checkout_id = callback["CheckoutRequestID"]
        result_code = int(callback["ResultCode"])
    except (KeyError, TypeError, ValueError):
        return Response({"ResultCode": 1, "ResultDesc": "Invalid callback payload"}, status=status.HTTP_400_BAD_REQUEST)
    payment = Payment.objects.filter(transaction_id=checkout_id, payment_method="M-Pesa").first()
    if not payment:
        # Provider callbacks may be retried after the corresponding payment is gone.
        return Response({"ResultCode": 0, "ResultDesc": "Callback acknowledged"})
    if payment.payment_status != "Pending":
        return Response({"ResultCode": 0, "ResultDesc": "Callback already processed"})
    if result_code == 0:
        # Callback payloads are not signed. Confirm the checkout directly with Daraja,
        # then require the provider result, amount, and checkout ID to agree.
        try:
            import requests
            access_token, base = mpesa_access_token()
            shortcode, passkey = os.getenv("MPESA_SHORTCODE", ""), os.getenv("MPESA_PASSKEY", "")
            timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
            import base64
            password = base64.b64encode(f"{shortcode}{passkey}{timestamp}".encode()).decode()
            verified = requests.post(f"{base}/mpesa/stkpushquery/v1/query", json={
                "BusinessShortCode": shortcode, "Password": password, "Timestamp": timestamp,
                "CheckoutRequestID": checkout_id,
            }, headers={"Authorization": f"Bearer {access_token}"}, timeout=20)
            verified.raise_for_status()
            provider = verified.json()
            metadata = callback.get("CallbackMetadata", {}).get("Item", [])
            callback_items = {item.get("Name"): item.get("Value") for item in metadata if isinstance(item, dict)}
            amount = Decimal(str(callback_items.get("Amount", "-1")))
            receipt = str(callback_items.get("MpesaReceiptNumber", ""))
            if (str(provider.get("ResultCode")) != "0" or amount != payment.amount
                    or not receipt or str(provider.get("CheckoutRequestID")) != str(checkout_id)):
                return Response({"ResultCode": 1, "ResultDesc": "Payment verification did not match"}, status=status.HTTP_400_BAD_REQUEST)
            with transaction.atomic():
                locked = Payment.objects.select_for_update().filter(payment_id=payment.payment_id, payment_status="Pending").first()
                if locked:
                    locked.payment_status = "Completed"
                    locked.transaction_id = receipt
                    locked.save(update_fields=["payment_status", "transaction_id"])
                    Order.objects.filter(order_id=locked.order_id).update(order_status="Preparing", updated_at=timezone.now())
        except Exception:
            return Response({"ResultCode": 1, "ResultDesc": "Payment verification unavailable"}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
    else:
        with transaction.atomic():
            Payment.objects.filter(payment_id=payment.payment_id, payment_status="Pending").update(payment_status="Failed")
    return Response({"ResultCode": 0, "ResultDesc": "Callback received successfully"})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def mpesa_payment_status(request, payment_id):
    payment = Payment.objects.select_related("order").filter(payment_id=payment_id, payment_method="M-Pesa").first()
    if not payment:
        return error("Payment not found", status.HTTP_404_NOT_FOUND)
    if request.user.role != "admin" and payment.order.user_id != request.user.user_id:
        return error("You are not authorized to view this payment", status.HTTP_403_FORBIDDEN)
    return Response({
        "payment_id": payment.payment_id, "order_id": payment.order_id,
        "payment_method": payment.payment_method, "amount": payment.amount,
        "payment_status": payment.payment_status, "transaction_id": payment.transaction_id,
        "payment_date": payment.payment_date,
    })


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def mpesa_query(request):
    import requests
    checkout_id = str(request.data.get("checkout_request_id", ""))
    payment = Payment.objects.select_related("order").filter(transaction_id=checkout_id, payment_method="M-Pesa").first()
    if not payment:
        return error("Payment not found", status.HTTP_404_NOT_FOUND)
    if request.user.role != "admin" and payment.order.user_id != request.user.user_id:
        return error("You are not authorized to query this payment", status.HTTP_403_FORBIDDEN)
    try:
        access_token, base = mpesa_access_token()
        shortcode, passkey = os.getenv("MPESA_SHORTCODE", ""), os.getenv("MPESA_PASSKEY", "")
        timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
        import base64
        password = base64.b64encode(f"{shortcode}{passkey}{timestamp}".encode()).decode()
        response = requests.post(f"{base}/mpesa/stkpushquery/v1/query", json={
            "BusinessShortCode": shortcode, "Password": password, "Timestamp": timestamp,
            "CheckoutRequestID": checkout_id,
        }, headers={"Authorization": f"Bearer {access_token}"}, timeout=20)
        response.raise_for_status()
        return Response(response.json())
    except (requests.RequestException, RuntimeError) as exc:
        return error("Failed to query M-Pesa transaction", status.HTTP_502_BAD_GATEWAY, message=str(exc))


@api_view(["GET", "POST"])
@permission_classes([AllowAny])
def contact_collection(request):
    if request.method == "GET":
        if not request.user or not request.user.is_authenticated or request.user.role != "admin":
            return error("Admin access required", status.HTTP_403_FORBIDDEN)
        messages = ContactMessage.objects.order_by("-created_at")[:200]
        return Response({"messages": [{
            "contact_id": m.contact_id, "name": m.name, "email": m.email,
            "phone": m.phone, "subject": m.subject, "message": m.message,
            "created_at": m.created_at,
        } for m in messages]})

    body = request.data
    name = str(body.get("name", "")).strip()
    email = str(body.get("email", "")).strip()
    phone = str(body.get("phone", "")).strip()
    subject = str(body.get("subject", "")).strip()
    message = str(body.get("message", "")).strip()

    if len(name) < 2:
        return error("Please enter your name")
    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
        return error("Please enter a valid email address")
    if phone and not re.fullmatch(r"(\+?254|0)(7|1)\d{8}", phone.replace(" ", "")):
        return error("Please enter a valid phone number")
    if len(subject) < 3:
        return error("Please enter a subject")
    if len(message) < 10:
        return error("Message must be at least 10 characters")

    try:
        ContactMessage.objects.create(
            name=name[:100], email=email[:100], phone=phone[:15] or None,
            subject=subject[:200], message=message,
        )
    except Exception:
        return error("Your message could not be sent right now. Please try again later.", status.HTTP_500_INTERNAL_SERVER_ERROR)
    return Response({"message": "Message sent successfully"}, status=status.HTTP_201_CREATED)
