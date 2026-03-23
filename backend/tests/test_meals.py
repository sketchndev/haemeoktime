import pytest


@pytest.fixture
def recommend_response():
    return {
        "days": [{
            "date": "2026-03-23",
            "meals": [{"meal_type": "dinner", "menus": ["된장찌개", "시금치나물"]}],
        }]
    }


def test_recommend_saves_history_and_returns_ids(client, mock_gemini, recommend_response):
    mock_gemini.recommend_meals.return_value = recommend_response
    res = client.post("/api/meals/recommend", json={
        "period": "today", "dates": ["2026-03-23"],
        "meal_types": ["dinner"], "available_ingredients": "", "use_school_meals": False,
    })
    assert res.status_code == 200
    days = res.json()["days"]
    menus = days[0]["meals"][0]["menus"]
    assert len(menus) == 2
    assert all("history_id" in m for m in menus)
    assert menus[0]["name"] == "된장찌개"


def test_recommend_auto_deletes_old_history(client, mock_gemini, recommend_response):
    mock_gemini.recommend_meals.return_value = recommend_response
    # 첫 번째 추천
    client.post("/api/meals/recommend", json={
        "period": "today", "dates": ["2026-03-23"],
        "meal_types": ["dinner"], "available_ingredients": "", "use_school_meals": False,
    })
    # 14일 초과 이력은 다음 추천 시 삭제됨 (DB에 직접 오래된 데이터 삽입 후 검증)
    from database import get_db_path
    import sqlite3
    conn = sqlite3.connect(get_db_path())
    conn.execute("INSERT INTO meal_history (date, meal_type, menu_name) VALUES ('2026-01-01', 'dinner', '옛날메뉴')")
    conn.commit()
    conn.close()

    mock_gemini.recommend_meals.return_value = recommend_response
    client.post("/api/meals/recommend", json={
        "period": "today", "dates": ["2026-03-24"],
        "meal_types": ["dinner"], "available_ingredients": "", "use_school_meals": False,
    })

    conn2 = sqlite3.connect(get_db_path())
    old = conn2.execute("SELECT * FROM meal_history WHERE menu_name='옛날메뉴'").fetchall()
    conn2.close()
    assert len(old) == 0


def test_delete_history_item(client, mock_gemini, recommend_response):
    mock_gemini.recommend_meals.return_value = recommend_response
    res = client.post("/api/meals/recommend", json={
        "period": "today", "dates": ["2026-03-23"],
        "meal_types": ["dinner"], "available_ingredients": "", "use_school_meals": False,
    })
    history_id = res.json()["days"][0]["meals"][0]["menus"][0]["history_id"]

    del_res = client.delete(f"/api/meals/history/{history_id}")
    assert del_res.status_code == 200


def test_single_rerecommend(client, mock_gemini, recommend_response):
    mock_gemini.recommend_meals.return_value = recommend_response
    rec = client.post("/api/meals/recommend", json={
        "period": "today", "dates": ["2026-03-23"],
        "meal_types": ["dinner"], "available_ingredients": "", "use_school_meals": False,
    })
    hid = rec.json()["days"][0]["meals"][0]["menus"][0]["history_id"]

    mock_gemini.re_recommend_single.return_value = {"menu_name": "비빔밥"}
    res = client.post("/api/meals/recommend/single", json={
        "date": "2026-03-23", "meal_type": "dinner",
        "history_id": hid, "menu_name": "된장찌개",
        "max_minutes_override": None, "existing_menus": ["시금치나물"],
    })
    assert res.status_code == 200
    assert res.json()["name"] == "비빔밥"


def test_mealtype_rerecommend(client, mock_gemini, recommend_response):
    mock_gemini.recommend_meals.return_value = recommend_response
    rec = client.post("/api/meals/recommend", json={
        "period": "today", "dates": ["2026-03-23"],
        "meal_types": ["dinner"], "available_ingredients": "", "use_school_meals": False,
    })
    hids = [m["history_id"] for m in rec.json()["days"][0]["meals"][0]["menus"]]

    mock_gemini.re_recommend_meal_type.return_value = {"menus": ["불고기", "미역국"]}
    res = client.post("/api/meals/recommend/meal-type", json={
        "date": "2026-03-23", "meal_type": "dinner",
        "max_minutes_override": 60, "existing_history_ids": hids,
    })
    assert res.status_code == 200
    assert len(res.json()["menus"]) == 2


def test_recommend_gemini_failure_returns_503(client, mock_gemini):
    mock_gemini.recommend_meals.side_effect = Exception("Gemini 호출 실패")
    res = client.post("/api/meals/recommend", json={
        "period": "today", "dates": ["2026-03-23"],
        "meal_types": ["dinner"], "available_ingredients": "", "use_school_meals": False,
    })
    assert res.status_code == 503


def test_get_today_meals_with_data(client):
    """오늘 meal_history가 있으면 plan 구조로 반환한다."""
    from database import get_db_path
    import sqlite3
    from datetime import date

    today = date.today().isoformat()
    conn = sqlite3.connect(get_db_path())
    conn.execute(
        "INSERT INTO meal_history (date, meal_type, menu_name) VALUES (?, 'dinner', '된장찌개')",
        (today,)
    )
    conn.execute(
        "INSERT INTO meal_history (date, meal_type, menu_name) VALUES (?, 'dinner', '시금치나물')",
        (today,)
    )
    conn.commit()
    conn.close()

    res = client.get("/api/meals/today")
    assert res.status_code == 200
    data = res.json()
    assert len(data["days"]) == 1
    assert data["days"][0]["date"] == today
    meals = data["days"][0]["meals"]
    assert len(meals) == 1
    assert meals[0]["meal_type"] == "dinner"
    assert meals[0]["is_school_meal"] is False
    menus = meals[0]["menus"]
    assert len(menus) == 2
    assert menus[0]["name"] == "된장찌개"
    assert "history_id" in menus[0]


def test_get_today_meals_empty(client):
    """오늘 meal_history가 없으면 days 빈 배열을 반환한다."""
    res = client.get("/api/meals/today")
    assert res.status_code == 200
    assert res.json() == {"days": []}
