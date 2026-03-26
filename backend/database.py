import sqlite3
import os

SCHEMA = """
CREATE TABLE IF NOT EXISTS family_tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tag TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cooking_time_settings (
    meal_type TEXT PRIMARY KEY,
    max_minutes INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS condiments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS meal_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date DATE NOT NULL,
    meal_type TEXT NOT NULL,
    menu_name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS favorite_recipes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    menu_name TEXT NOT NULL,
    recipe_type TEXT NOT NULL DEFAULT 'individual',
    recipe_data TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS shopping_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    quantity TEXT,
    category TEXT,
    is_checked BOOLEAN DEFAULT FALSE,
    is_auto BOOLEAN DEFAULT FALSE,
    week_start DATE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS frequent_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS school_meals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date DATE NOT NULL UNIQUE,
    menu_items TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS meal_plan_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS menu_ingredients (
    menu_name TEXT PRIMARY KEY,
    ingredients TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
"""


def get_db_path() -> str:
    return os.getenv("DB_PATH", "haemeoktime.db")


def init_db(db_path: str | None = None) -> None:
    path = db_path or get_db_path()
    conn = sqlite3.connect(path)
    conn.executescript(SCHEMA)
    # Migration: add new columns to existing favorite_recipes table
    try:
        conn.execute("ALTER TABLE favorite_recipes ADD COLUMN recipe_type TEXT NOT NULL DEFAULT 'individual'")
    except sqlite3.OperationalError:
        pass  # Column already exists
    try:
        conn.execute("ALTER TABLE favorite_recipes ADD COLUMN recipe_data TEXT")
    except sqlite3.OperationalError:
        pass  # Column already exists
    conn.execute("""
        INSERT OR IGNORE INTO cooking_time_settings (meal_type, max_minutes)
        VALUES ('breakfast', 15), ('lunch', 30), ('dinner', 40)
    """)
    conn.execute("""
        INSERT OR IGNORE INTO meal_plan_settings (key, value)
        VALUES ('weekly_rule', ''), ('composition_rule', '')
    """)
    conn.commit()
    conn.close()


def open_db() -> sqlite3.Connection:
    """수동 연결 생성 (StreamingResponse 제너레이터 내부용). 호출자가 직접 commit/close 해야 한다."""
    conn = sqlite3.connect(get_db_path(), check_same_thread=False, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def get_db():
    """FastAPI Depends 용 DB 연결 제공."""
    conn = open_db()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
