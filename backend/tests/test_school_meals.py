def test_get_school_meals_empty(client):
    res = client.get("/api/school-meals")
    assert res.status_code == 200
    assert res.json() == []


def test_photo_upload_saves_and_returns_meals(client, mock_gemini):
    mock_gemini.parse_school_meal_photo.return_value = {
        "days": [
            {"date": "2026-03-16", "menu_items": ["잡채", "미역국"]},
            {"date": "2026-03-17", "menu_items": ["불고기", "된장찌개"]},
        ]
    }
    res = client.post(
        "/api/school-meals/photo",
        files={"file": ("meal.jpg", b"fake", "image/jpeg")},
    )
    assert res.status_code == 200
    days = res.json()
    assert len(days) == 2
    assert days[0]["date"] == "2026-03-16"
    assert "잡채" in days[0]["menu_items"]


def test_get_school_meals_returns_current_week(client, mock_gemini):
    mock_gemini.parse_school_meal_photo.return_value = {
        "days": [{"date": "2026-03-16", "menu_items": ["비빔밥"]}]
    }
    client.post("/api/school-meals/photo", files={"file": ("m.jpg", b"x", "image/jpeg")})

    res = client.get("/api/school-meals")
    assert any(d["date"] == "2026-03-16" for d in res.json())


def test_duplicate_date_upserts(client, mock_gemini):
    mock_gemini.parse_school_meal_photo.return_value = {
        "days": [{"date": "2026-03-16", "menu_items": ["첫번째"]}]
    }
    client.post("/api/school-meals/photo", files={"file": ("a.jpg", b"x", "image/jpeg")})

    mock_gemini.parse_school_meal_photo.return_value = {
        "days": [{"date": "2026-03-16", "menu_items": ["두번째"]}]
    }
    client.post("/api/school-meals/photo", files={"file": ("b.jpg", b"x", "image/jpeg")})

    res = client.get("/api/school-meals")
    meals_on_date = [d for d in res.json() if d["date"] == "2026-03-16"]
    assert len(meals_on_date) == 1
    assert "두번째" in meals_on_date[0]["menu_items"]


def test_photo_gemini_failure_returns_503(client, mock_gemini):
    mock_gemini.parse_school_meal_photo.side_effect = Exception("Gemini 호출 실패")
    res = client.post("/api/school-meals/photo", files={"file": ("x.jpg", b"y", "image/jpeg")})
    assert res.status_code == 503
