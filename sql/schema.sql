-- AquaLuxe database (MySQL / MariaDB / XAMPP)
-- The server runs this file automatically on first start. You can also import it by hand in phpMyAdmin.
CREATE DATABASE IF NOT EXISTS aqualuxe_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE aqualuxe_db;

CREATE TABLE IF NOT EXISTS admin_users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(80) NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL DEFAULT 'Store Owner',
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  slug VARCHAR(120) NOT NULL UNIQUE,
  icon VARCHAR(16) DEFAULT '🐟',
  sort_order INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  category_id INT NULL,
  price DECIMAL(10,2) NOT NULL DEFAULT 0,
  old_price DECIMAL(10,2) NULL,
  cost_price DECIMAL(10,2) NOT NULL DEFAULT 0,
  stock INT NOT NULL DEFAULT 0,
  low_stock_alert INT NOT NULL DEFAULT 5,
  description TEXT,
  how_to_use TEXT,
  image VARCHAR(255) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  is_featured TINYINT(1) NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_prod_cat FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_no VARCHAR(30) NOT NULL UNIQUE,
  customer_name VARCHAR(160) NOT NULL,
  customer_phone VARCHAR(40) NOT NULL,
  customer_email VARCHAR(160) NULL,
  customer_address TEXT NOT NULL,
  district VARCHAR(80) NULL,
  payment_method VARCHAR(30) NOT NULL DEFAULT 'cod',
  notes TEXT NULL,
  subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
  shipping DECIMAL(10,2) NOT NULL DEFAULT 0,
  total DECIMAL(12,2) NOT NULL DEFAULT 0,
  delivery_zone VARCHAR(20) NULL,
  advance_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  balance_due DECIMAL(12,2) NOT NULL DEFAULT 0,
  advance_status VARCHAR(12) NOT NULL DEFAULT 'unpaid',
  advance_trx VARCHAR(60) NULL,
  status ENUM('pending','confirmed','shipped','delivered','cancelled') NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_orders_status (status),
  INDEX idx_orders_created (created_at)
);

CREATE TABLE IF NOT EXISTS order_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  product_id INT NULL,
  product_name VARCHAR(255) NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  cost DECIMAL(10,2) NOT NULL DEFAULT 0,
  qty INT NOT NULL,
  CONSTRAINT fk_item_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

-- Buying side: every time the owner buys stock from a supplier
CREATE TABLE IF NOT EXISTS purchases (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_id INT NULL,
  product_name VARCHAR(255) NOT NULL,
  supplier VARCHAR(160) NULL,
  qty INT NOT NULL,
  unit_cost DECIMAL(10,2) NOT NULL,
  total DECIMAL(12,2) NOT NULL,
  note VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_purchases_created (created_at)
);

CREATE TABLE IF NOT EXISTS messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  contact VARCHAR(160) NOT NULL,
  message TEXT NOT NULL,
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Customers hidden from the Customers list (soft delete). Their orders are never touched.
CREATE TABLE IF NOT EXISTS archived_customers (
  phone_key VARCHAR(20) PRIMARY KEY,
  name VARCHAR(160) NULL,
  archived_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- AI chat assistant (separate from the contact-form "messages" table)
CREATE TABLE IF NOT EXISTS chat_conversations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  session_id VARCHAR(64) NOT NULL,
  last_intent_context TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_chat_session (session_id)
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  conversation_id INT NOT NULL,
  role VARCHAR(12) NOT NULL,
  content TEXT NOT NULL,
  tool_calls TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_chat_msg_conv (conversation_id),
  CONSTRAINT fk_chat_msg_conv FOREIGN KEY (conversation_id) REFERENCES chat_conversations(id) ON DELETE CASCADE
);

-- Aquarium knowledge (English + Bangla) the assistant searches
CREATE TABLE IF NOT EXISTS knowledge_documents (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(190) NOT NULL UNIQUE,
  category VARCHAR(100) NOT NULL,
  source VARCHAR(255) NULL,
  language VARCHAR(10) NOT NULL DEFAULT 'en',
  content MEDIUMTEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_knowledge_category (category),
  FULLTEXT KEY ft_knowledge (title, content)
);

-- Questions the assistant could not answer safely, for the owner to review in Admin > AI Chat
CREATE TABLE IF NOT EXISTS unknown_questions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  conversation_id INT NULL,
  question TEXT NOT NULL,
  language VARCHAR(10) NULL,
  intent VARCHAR(100) NULL,
  missing_information TEXT NULL,
  attempted_answer TEXT NULL,
  confidence VARCHAR(10) DEFAULT 'low',
  human_review_needed TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS settings (
  k VARCHAR(60) PRIMARY KEY,
  v TEXT
);
