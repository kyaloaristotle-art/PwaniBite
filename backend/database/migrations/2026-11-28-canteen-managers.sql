-- Add scoped canteen manager accounts. Apply after the canteens migration.
ALTER TABLE users
    MODIFY role ENUM('customer', 'admin', 'delivery', 'staff', 'canteen_manager') DEFAULT 'customer';

SET @manager_column_exists = (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'managed_canteen_id'
);
SET @manager_column_sql = IF(@manager_column_exists = 0,
    'ALTER TABLE users ADD COLUMN managed_canteen_id INT NULL AFTER role',
    'SELECT 1');
PREPARE manager_column_stmt FROM @manager_column_sql;
EXECUTE manager_column_stmt;
DEALLOCATE PREPARE manager_column_stmt;

SET @manager_index_exists = (
    SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND INDEX_NAME = 'idx_user_managed_canteen'
);
SET @manager_index_sql = IF(@manager_index_exists = 0,
    'CREATE INDEX idx_user_managed_canteen ON users (managed_canteen_id)',
    'SELECT 1');
PREPARE manager_index_stmt FROM @manager_index_sql;
EXECUTE manager_index_stmt;
DEALLOCATE PREPARE manager_index_stmt;

SET @manager_fk_exists = (
    SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND CONSTRAINT_NAME = 'fk_user_managed_canteen'
);
SET @manager_fk_sql = IF(@manager_fk_exists = 0,
    'ALTER TABLE users ADD CONSTRAINT fk_user_managed_canteen FOREIGN KEY (managed_canteen_id) REFERENCES canteens(canteen_id) ON DELETE SET NULL',
    'SELECT 1');
PREPARE manager_fk_stmt FROM @manager_fk_sql;
EXECUTE manager_fk_stmt;
DEALLOCATE PREPARE manager_fk_stmt;
