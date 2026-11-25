-- Pwani Bite Database Schema
-- Online Campus Food Ordering and Delivery System

-- Create Database
CREATE DATABASE IF NOT EXISTS pwani_bite;
USE pwani_bite;

-- ============================================
-- USERS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS users (
    user_id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    phone VARCHAR(15) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role ENUM('customer', 'admin', 'delivery', 'staff') DEFAULT 'customer',
    hostel VARCHAR(50),
    block VARCHAR(50),
    room VARCHAR(20),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_email (email),
    INDEX idx_phone (phone),
    INDEX idx_role (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- FOOD TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS food (
    food_id INT AUTO_INCREMENT PRIMARY KEY,
    food_name VARCHAR(100) NOT NULL,
    description TEXT,
    price DECIMAL(10, 2) NOT NULL,
    image VARCHAR(255),
    category VARCHAR(50) NOT NULL,
    availability BOOLEAN DEFAULT TRUE,
    stock_quantity INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_category (category),
    INDEX idx_availability (availability)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- ORDERS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS orders (
    order_id INT AUTO_INCREMENT PRIMARY KEY,
    order_number VARCHAR(20) UNIQUE NOT NULL,
    user_id INT NOT NULL,
    order_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    total_amount DECIMAL(10, 2) NOT NULL,
    delivery_location VARCHAR(255) NOT NULL,
    hostel VARCHAR(50) NOT NULL,
    block VARCHAR(50) NOT NULL,
    room VARCHAR(20) NOT NULL,
    delivery_time VARCHAR(50),
    special_instructions TEXT,
    order_status ENUM('Pending', 'Preparing', 'Out for Delivery', 'Delivered', 'Cancelled') DEFAULT 'Pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id),
    INDEX idx_order_status (order_status),
    INDEX idx_order_date (order_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- ORDER_ITEMS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS order_items (
    order_item_id INT AUTO_INCREMENT PRIMARY KEY,
    order_id INT NOT NULL,
    food_id INT NOT NULL,
    quantity INT NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    subtotal DECIMAL(10, 2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE,
    FOREIGN KEY (food_id) REFERENCES food(food_id) ON DELETE CASCADE,
    INDEX idx_order_id (order_id),
    INDEX idx_food_id (food_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- PAYMENTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS payments (
    payment_id INT AUTO_INCREMENT PRIMARY KEY,
    order_id INT NOT NULL,
    payment_method ENUM('M-Pesa', 'Cash', 'Card', 'Bank Transfer') NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    payment_status ENUM('Pending', 'Completed', 'Failed', 'Refunded') DEFAULT 'Pending',
    transaction_id VARCHAR(100),
    payment_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE,
    UNIQUE KEY uq_payments_order_id (order_id),
    INDEX idx_payment_status (payment_status),
    INDEX idx_transaction_id (transaction_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- DELIVERY TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS delivery (
    delivery_id INT AUTO_INCREMENT PRIMARY KEY,
    order_id INT NOT NULL,
    delivery_person_id INT,
    location VARCHAR(255) NOT NULL,
    delivery_status ENUM('Pending', 'Assigned', 'Picked Up', 'In Transit', 'Delivered', 'Failed') DEFAULT 'Pending',
    assigned_at TIMESTAMP NULL,
    picked_up_at TIMESTAMP NULL,
    delivered_at TIMESTAMP NULL,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE,
    FOREIGN KEY (delivery_person_id) REFERENCES users(user_id) ON DELETE SET NULL,
    INDEX idx_order_id (order_id),
    INDEX idx_delivery_person_id (delivery_person_id),
    INDEX idx_delivery_status (delivery_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- FEEDBACK TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS feedback (
    feedback_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    order_id INT NOT NULL,
    food_rating INT CHECK (food_rating >= 1 AND food_rating <= 5),
    delivery_rating INT CHECK (delivery_rating >= 1 AND delivery_rating <= 5),
    overall_rating INT CHECK (overall_rating >= 1 AND overall_rating <= 5),
    recommend BOOLEAN,
    comments TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id),
    INDEX idx_order_id (order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- INSERT DEFAULT ADMIN USER
-- ============================================
INSERT INTO users (name, email, phone, password, role) VALUES
('Admin User', 'admin@pwanibite.com', '0712345678', '$2a$10$Ex1E0sWZ6If8Q3gh97BnRuQSJpJcH2bfnRggvZo0vFE.BoUIHfD3m', 'admin');

-- ============================================
-- INSERT MENU ITEMS (seed missing entries; existing entries are updated by name)
-- ============================================
INSERT INTO food (food_name, description, price, category, availability, stock_quantity)
SELECT menu.food_name, menu.description, menu.price, menu.category, TRUE, 50
FROM (
    SELECT 'Tamarind Juice' food_name, 'Fresh tamarind juice' description, 30.00 price, 'Juices' category UNION ALL
    SELECT 'Passion Juice', 'Fresh passion juice', 40.00, 'Juices' UNION ALL
    SELECT 'Mango Juice', 'Fresh mango juice', 50.00, 'Juices' UNION ALL
    SELECT 'Pineapple Juice', 'Fresh pineapple juice', 40.00, 'Juices' UNION ALL
    SELECT 'Hibiscus Juice', 'Refreshing hibiscus juice', 50.00, 'Juices' UNION ALL
    SELECT 'Samosa', 'Crispy samosa', 10.00, 'Snacks' UNION ALL
    SELECT 'Viazi Karai', 'Spiced viazi karai', 5.00, 'Snacks' UNION ALL
    SELECT 'Donut', 'Fresh donut', 10.00, 'Snacks' UNION ALL
    SELECT 'Chapati', 'Fresh chapati', 15.00, 'Snacks' UNION ALL
    SELECT 'Chips', 'Crispy chips', 100.00, 'Snacks' UNION ALL
    SELECT 'Smokie', 'Smokie sausage', 40.00, 'Snacks' UNION ALL
    SELECT 'Boiled Eggs', 'Boiled eggs', 30.00, 'Snacks' UNION ALL
    SELECT 'Smocha', 'Smokie wrapped in chapati', 60.00, 'Snacks' UNION ALL
    SELECT 'Chips Zoge', 'Chips zoge', 150.00, 'Snacks' UNION ALL
    SELECT 'Chips Kuku Macha', 'Chips kuku macha', 300.00, 'Snacks' UNION ALL
    SELECT 'Chapati & Beans Offer', 'Four chapatis served with beans', 60.00, 'Main Dishes' UNION ALL
    SELECT 'Ugali & Omena', 'Ugali served with omena', 70.00, 'Main Dishes' UNION ALL
    SELECT 'Ugali & Mayai', 'Ugali served with eggs', 100.00, 'Main Dishes' UNION ALL
    SELECT 'Rice & Beans', 'Rice served with beans', 70.00, 'Main Dishes' UNION ALL
    SELECT 'Kahawa', 'Kenyan coffee', 20.00, 'Drinks' UNION ALL
    SELECT 'Chai Rangi', 'Kenyan black tea', 20.00, 'Drinks' UNION ALL
    SELECT 'Milk Tea', 'Tea with milk', 30.00, 'Drinks' UNION ALL
    SELECT 'Mineral Water', 'Bottled mineral water', 30.00, 'Drinks'
) AS menu
LEFT JOIN food existing ON LOWER(existing.food_name) = LOWER(menu.food_name)
WHERE existing.food_id IS NULL;

UPDATE food SET price = 100.00, category = 'Snacks', description = 'Crispy chips'
WHERE LOWER(food_name) = 'chips';
UPDATE food SET price = 70.00, category = 'Main Dishes', description = 'Rice served with beans'
WHERE LOWER(food_name) = 'rice & beans';

-- ============================================
-- CREATE VIEWS FOR REPORTS
-- ============================================

-- Sales Report View
CREATE OR REPLACE VIEW sales_report AS
SELECT
    DATE(order_date) as sale_date,
    COUNT(*) as total_orders,
    SUM(total_amount) as total_sales,
    AVG(total_amount) as average_order_value
FROM orders
WHERE order_status != 'Cancelled'
GROUP BY DATE(order_date)
ORDER BY sale_date DESC;

-- Popular Items View
CREATE OR REPLACE VIEW popular_items AS
SELECT
    f.food_name,
    f.category,
    SUM(oi.quantity) as total_ordered,
    SUM(oi.subtotal) as total_revenue
FROM order_items oi
JOIN food f ON oi.food_id = f.food_id
JOIN orders o ON oi.order_id = o.order_id
WHERE o.order_status != 'Cancelled'
GROUP BY f.food_id, f.food_name, f.category
ORDER BY total_ordered DESC;

-- Customer Orders View
CREATE OR REPLACE VIEW customer_orders AS
SELECT
    u.user_id,
    u.name,
    u.email,
    u.phone,
    u.hostel,
    COUNT(o.order_id) as total_orders,
    SUM(o.total_amount) as total_spent
FROM users u
LEFT JOIN orders o ON u.user_id = o.user_id
WHERE u.role = 'customer'
GROUP BY u.user_id, u.name, u.email, u.phone, u.hostel
ORDER BY total_orders DESC;

-- Delivery Performance View
CREATE OR REPLACE VIEW delivery_performance AS
SELECT
    u.name as delivery_person,
    COUNT(d.delivery_id) as total_deliveries,
    SUM(CASE WHEN d.delivery_status = 'Delivered' THEN 1 ELSE 0 END) as successful_deliveries,
    AVG(TIMESTAMPDIFF(MINUTE, d.assigned_at, d.delivered_at)) as avg_delivery_time_minutes
FROM delivery d
JOIN users u ON d.delivery_person_id = u.user_id
WHERE d.delivery_status = 'Delivered'
GROUP BY u.user_id, u.name
ORDER BY successful_deliveries DESC;
