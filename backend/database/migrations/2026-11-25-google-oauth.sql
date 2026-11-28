-- Run once against the existing pwani_bite database before enabling Google sign-in.
-- Existing password accounts remain unchanged; Google-only accounts can have no phone/password.
ALTER TABLE users
    MODIFY phone VARCHAR(15) NULL,
    MODIFY password VARCHAR(255) NULL;

CREATE TABLE IF NOT EXISTS user_oauth_accounts (
    oauth_account_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    provider VARCHAR(30) NOT NULL,
    provider_user_id VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_provider_account (provider, provider_user_id),
    INDEX idx_oauth_user (user_id),
    CONSTRAINT fk_oauth_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
