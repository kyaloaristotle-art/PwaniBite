"""Read/write mappings for the existing MySQL schema (no schema migration)."""
from django.db import models


class User(models.Model):
    user_id = models.AutoField(primary_key=True)
    name = models.CharField(max_length=100)
    email = models.EmailField(max_length=100, unique=True)
    phone = models.CharField(max_length=15, unique=True)
    password = models.CharField(max_length=255)
    role = models.CharField(max_length=20, default="customer")
    hostel = models.CharField(max_length=50, null=True, blank=True)
    block = models.CharField(max_length=50, null=True, blank=True)
    room = models.CharField(max_length=20, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    @property
    def is_authenticated(self):
        return True

    @property
    def is_anonymous(self):
        return False

    class Meta:
        managed = False
        db_table = "users"


class Food(models.Model):
    food_id = models.AutoField(primary_key=True)
    food_name = models.CharField(max_length=100)
    description = models.TextField(null=True, blank=True)
    price = models.DecimalField(max_digits=10, decimal_places=2)
    image = models.CharField(max_length=255, null=True, blank=True)
    category = models.CharField(max_length=50)
    availability = models.BooleanField(default=True)
    stock_quantity = models.IntegerField(default=0, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        managed = False
        db_table = "food"


class Order(models.Model):
    STATUSES = ["Pending", "Preparing", "Out for Delivery", "Delivered", "Cancelled"]
    order_id = models.AutoField(primary_key=True)
    order_number = models.CharField(max_length=20, unique=True)
    user = models.ForeignKey(User, db_column="user_id", on_delete=models.DO_NOTHING, related_name="orders")
    order_date = models.DateTimeField(auto_now_add=True)
    total_amount = models.DecimalField(max_digits=10, decimal_places=2)
    delivery_location = models.CharField(max_length=255)
    hostel = models.CharField(max_length=50)
    block = models.CharField(max_length=50)
    room = models.CharField(max_length=20)
    delivery_time = models.CharField(max_length=50, null=True, blank=True)
    special_instructions = models.TextField(null=True, blank=True)
    order_status = models.CharField(max_length=30, default="Pending")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        managed = False
        db_table = "orders"


class OrderItem(models.Model):
    order_item_id = models.AutoField(primary_key=True)
    order = models.ForeignKey(Order, db_column="order_id", on_delete=models.DO_NOTHING, related_name="items")
    food = models.ForeignKey(Food, db_column="food_id", on_delete=models.DO_NOTHING)
    quantity = models.IntegerField()
    price = models.DecimalField(max_digits=10, decimal_places=2)
    subtotal = models.DecimalField(max_digits=10, decimal_places=2)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        managed = False
        db_table = "order_items"


class Payment(models.Model):
    STATUSES = ["Pending", "Completed", "Failed", "Refunded"]
    payment_id = models.AutoField(primary_key=True)
    order = models.ForeignKey(Order, db_column="order_id", on_delete=models.DO_NOTHING, related_name="payments")
    payment_method = models.CharField(max_length=30)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    payment_status = models.CharField(max_length=20, default="Pending")
    transaction_id = models.CharField(max_length=100, null=True, blank=True)
    payment_date = models.DateTimeField(auto_now_add=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        managed = False
        db_table = "payments"


class Delivery(models.Model):
    STATUSES = ["Pending", "Assigned", "Picked Up", "In Transit", "Delivered", "Failed"]
    delivery_id = models.AutoField(primary_key=True)
    order = models.ForeignKey(Order, db_column="order_id", on_delete=models.DO_NOTHING, related_name="deliveries")
    delivery_person = models.ForeignKey(User, db_column="delivery_person_id", on_delete=models.DO_NOTHING, null=True, blank=True, related_name="assigned_deliveries")
    location = models.CharField(max_length=255)
    delivery_status = models.CharField(max_length=20, default="Pending")
    assigned_at = models.DateTimeField(null=True, blank=True)
    picked_up_at = models.DateTimeField(null=True, blank=True)
    delivered_at = models.DateTimeField(null=True, blank=True)
    notes = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        managed = False
        db_table = "delivery"


class Feedback(models.Model):
    feedback_id = models.AutoField(primary_key=True)
    user = models.ForeignKey(User, db_column="user_id", on_delete=models.DO_NOTHING)
    order = models.ForeignKey(Order, db_column="order_id", on_delete=models.DO_NOTHING)
    food_rating = models.IntegerField(null=True, blank=True)
    delivery_rating = models.IntegerField(null=True, blank=True)
    overall_rating = models.IntegerField(null=True, blank=True)
    recommend = models.BooleanField(null=True, blank=True)
    comments = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        managed = False
        db_table = "feedback"
