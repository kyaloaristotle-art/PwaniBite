-- Multi-canteen support: Main Canteen, Savannah Canteen, Runda Canteen.
-- Run once against the existing pwani_bite database.
-- Existing food items are assigned to Main Canteen; existing orders keep
-- canteen_id NULL (they predate canteen tracking).

CREATE TABLE IF NOT EXISTS canteens (
    canteen_id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    description VARCHAR(255) NULL,
    location VARCHAR(255) NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_canteen_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO canteens (name, description, location)
SELECT 'Main Canteen', 'The main campus canteen', 'Main campus grounds'
WHERE NOT EXISTS (SELECT 1 FROM canteens WHERE name = 'Main Canteen');

INSERT INTO canteens (name, description, location)
SELECT 'Savannah Canteen', 'Canteen serving the Savannah hostels', 'Savannah hostels area'
WHERE NOT EXISTS (SELECT 1 FROM canteens WHERE name = 'Savannah Canteen');

INSERT INTO canteens (name, description, location)
SELECT 'Runda Canteen', 'Canteen serving the Runda hostels', 'Runda hostels area'
WHERE NOT EXISTS (SELECT 1 FROM canteens WHERE name = 'Runda Canteen');

SET @main_canteen_id = (SELECT canteen_id FROM canteens WHERE name = 'Main Canteen' LIMIT 1);

SET @food_has_canteen = (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'food' AND COLUMN_NAME = 'canteen_id'
);
SET @food_sql = IF(@food_has_canteen = 0,
    'ALTER TABLE food ADD COLUMN canteen_id INT NULL AFTER category, ADD INDEX idx_food_canteen (canteen_id), ADD CONSTRAINT fk_food_canteen FOREIGN KEY (canteen_id) REFERENCES canteens(canteen_id) ON DELETE SET NULL',
    'SELECT 1');
PREPARE food_stmt FROM @food_sql;
EXECUTE food_stmt;
DEALLOCATE PREPARE food_stmt;

UPDATE food SET canteen_id = @main_canteen_id WHERE canteen_id IS NULL;

SET @order_has_canteen = (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'canteen_id'
);
SET @order_sql = IF(@order_has_canteen = 0,
    'ALTER TABLE orders ADD COLUMN canteen_id INT NULL AFTER user_id, ADD INDEX idx_order_canteen (canteen_id), ADD CONSTRAINT fk_order_canteen FOREIGN KEY (canteen_id) REFERENCES canteens(canteen_id) ON DELETE SET NULL',
    'SELECT 1');
PREPARE order_stmt FROM @order_sql;
EXECUTE order_stmt;
DEALLOCATE PREPARE order_stmt;
