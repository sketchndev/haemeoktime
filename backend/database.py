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
"""


def get_db_path() -> str:
    return os.getenv("DB_PATH", "haemeoktime.db")


def init_db(db_path: str | None = None) -> None:
    path = db_path or get_db_path()
    conn = sqlite3.connect(path)
    conn.executescript(SCHEMA)
    conn.execute("""
        INSERT OR IGNORE INTO cooking_time_settings (meal_type, max_minutes)
        VALUES ('breakfast', 15), ('lunch', 30), ('dinner', 40)
    """)
    conn.commit()
    conn.close()


def get_db():
    """FastAPI Depends 용 DB 연결 제공."""
    conn = sqlite3.connect(get_db_path())
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
