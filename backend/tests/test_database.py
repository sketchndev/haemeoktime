import sqlite3
import pytest
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from database import init_db


def test_init_db_creates_all_tables(tmp_path):
    db_path = str(tmp_path / "test.db")
    init_db(db_path)

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
    tables = {row[0] for row in cursor.fetchall()}
    conn.close()

    expected = {
        "family_tags", "cooking_time_settings", "condiments",
        "meal_history", "favorite_recipes", "shopping_items",
        "frequent_items", "school_meals",
    }
    assert expected.issubset(tables)


def test_init_db_seeds_default_cooking_times(tmp_path):
    db_path = str(tmp_path / "test.db")
    init_db(db_path)

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    rows = conn.execute("SELECT meal_type, max_minutes FROM cooking_time_settings").fetchall()
    conn.close()

    data = {r["meal_type"]: r["max_minutes"] for r in rows}
    assert data == {"breakfast": 15, "lunch": 30, "dinner": 40}


def test_init_db_is_idempotent(tmp_path):
    db_path = str(tmp_path / "test.db")
    init_db(db_path)
    init_db(db_path)  # 두 번 호출해도 오류 없어야 함

    conn = sqlite3.connect(db_path)
    count = conn.execute("SELECT COUNT(*) FROM cooking_time_settings").fetchone()[0]
    conn.close()
    assert count == 3  # 중복 삽입 없이 3개만
