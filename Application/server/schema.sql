-- ==============================================================================
-- Timex QC System - Database Schema & Table Definitions
-- Compatible with SQLite, PostgreSQL, and Cloud SQL databases (AWS RDS, Vercel, Turso)
-- ==============================================================================

PRAGMA foreign_keys = ON;

-- ------------------------------------------------------------------------------
-- 1. USERS TABLE
-- Stores operator and manager authentication credentials and roles
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'operator', -- 'manager' or 'operator'
    name TEXT
);

-- ------------------------------------------------------------------------------
-- 2. BATCHES TABLE
-- Stores production batches, SKU parameters, component images, and QC progress
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS batches (
    id TEXT PRIMARY KEY,
    sku TEXT,
    brand TEXT,
    serial TEXT,
    pcs INTEGER DEFAULT 0,
    week TEXT,
    ml TEXT,
    family TEXT,
    famPcs INTEGER DEFAULT 0,
    description TEXT,
    wip TEXT,
    image TEXT,
    caseBackType TEXT,
    createdAt TEXT,
    check4Bypass BOOLEAN DEFAULT 0,
    check4Samples TEXT,
    qcState TEXT DEFAULT 'PENDING',
    confirmedBy TEXT,
    isSaved BOOLEAN DEFAULT 0,
    tasks TEXT
);

-- ------------------------------------------------------------------------------
-- 3. COMPONENTS TABLE
-- Stores bill-of-materials and technical watch components linked to a batch
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS components (
    id TEXT PRIMARY KEY,
    batch_id TEXT NOT NULL,
    code TEXT,
    description TEXT,
    supplier TEXT,
    FOREIGN KEY (batch_id) REFERENCES batches (id) ON DELETE CASCADE
);

-- ------------------------------------------------------------------------------
-- 4. WATCH_ACTIONS TABLE
-- Event-sourced audit trail of every watch scanned, defects logged, and checks passed
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS watch_actions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_id TEXT NOT NULL,
    barcode TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    action TEXT NOT NULL, -- 'PASS', 'DEFECT', 'REPAIRED', etc.
    tags TEXT,            -- Comma-separated or JSON list of defect tags
    FOREIGN KEY (batch_id) REFERENCES batches (id) ON DELETE CASCADE
);

-- ------------------------------------------------------------------------------
-- 5. USER_ACTIVITY_LOGS TABLE
-- Tracks shift activity, operator efficiency, and station inspection logs
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_activity_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    batch_id TEXT,
    barcode TEXT,
    task TEXT,
    units INTEGER DEFAULT 1,
    timestamp TEXT NOT NULL
);

-- ------------------------------------------------------------------------------
-- INDEXES FOR QUERY OPTIMIZATION
-- ------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_watch_actions_batch ON watch_actions (batch_id);
CREATE INDEX IF NOT EXISTS idx_watch_actions_barcode ON watch_actions (barcode);
CREATE INDEX IF NOT EXISTS idx_components_batch ON components (batch_id);
CREATE INDEX IF NOT EXISTS idx_activity_username ON user_activity_logs (username);
CREATE INDEX IF NOT EXISTS idx_batches_sku ON batches (sku);

-- ------------------------------------------------------------------------------
-- DEFAULT SEED DATA
-- Default Manager and Operator accounts (password: password123)
-- ------------------------------------------------------------------------------
INSERT OR IGNORE INTO users (username, password, role, name) VALUES 
('admin', 'password123', 'manager', 'Quality Manager'),
('operator', 'password123', 'operator', 'General Operator'),
('OP1', 'password123', 'operator', 'Operator 1'),
('OP2', 'password123', 'operator', 'Operator 2'),
('OP3', 'password123', 'operator', 'Operator 3'),
('OP4', 'password123', 'operator', 'Operator 4'),
('OP5', 'password123', 'operator', 'Operator 5'),
('OP6', 'password123', 'operator', 'Operator 6'),
('OP7', 'password123', 'operator', 'Operator 7'),
('OP8', 'password123', 'operator', 'Operator 8'),
('OP9', 'password123', 'operator', 'Operator 9'),
('OP10', 'password123', 'operator', 'Operator 10'),
('OP11', 'password123', 'operator', 'Operator 11'),
('OP12', 'password123', 'operator', 'Operator 12');
