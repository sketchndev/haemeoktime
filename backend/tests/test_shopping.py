def test_get_shopping_empty(client):
    res = client.get("/api/shopping")
    assert res.status_code == 200
    assert res.json()["items"] == []


def test_add_manual_item(client):
    res = client.post("/api/shopping/items", json={"name": "우유", "quantity": "1개", "category": "유제품/계란"})
    assert res.status_code == 200
    item = res.json()
    assert item["name"] == "우유"
    assert item["is_auto"] is False


def test_check_item(client):
    item_id = client.post("/api/shopping/items", json={"name": "계란"}).json()["id"]
    res = client.patch(f"/api/shopping/items/{item_id}", json={"is_checked": True})
    assert res.status_code == 200

    items = client.get("/api/shopping").json()["items"]
    item = next(i for i in items if i["id"] == item_id)
    assert item["is_checked"] is True


def test_delete_item(client):
    item_id = client.post("/api/shopping/items", json={"name": "두부"}).json()["id"]
    client.delete(f"/api/shopping/items/{item_id}")

    items = client.get("/api/shopping").json()["items"]
    assert not any(i["id"] == item_id for i in items)


def test_generate_replaces_auto_items(client, mock_gemini):
    mock_gemini.recommend_meals.return_value = {
        "days": [{"date": "2026-03-23", "meals": [{"meal_type": "dinner", "menus": ["메뉴"]}]}]
    }
    client.post("/api/meals/recommend", json={
        "period": "today", "dates": ["2026-03-23"],
        "meal_types": ["dinner"], "available_ingredients": "", "use_school_meals": False,
    })
    client.put("/api/meals/approve")

    mock_gemini.generate_shopping_list.return_value = {
        "items": [{"name": "애호박", "quantity": "1개", "category": "채소/과일"}]
    }
    # 첫 번째 자동 생성
    client.post("/api/shopping/generate", json={"menus": ["된장찌개"]})

    mock_gemini.generate_shopping_list.return_value = {
        "items": [{"name": "소고기", "quantity": "300g", "category": "육류/해산물"}]
    }
    # 두 번째 자동 생성 — 기존 is_auto 항목 교체
    client.post("/api/shopping/generate", json={"menus": ["소고기무국"]})

    items = client.get("/api/shopping").json()["items"]
    auto_items = [i for i in items if i["is_auto"]]
    assert len(auto_items) == 1
    assert auto_items[0]["name"] == "소고기"


def test_generate_preserves_manual_items(client, mock_gemini):
    mock_gemini.recommend_meals.return_value = {
        "days": [{"date": "2026-03-23", "meals": [{"meal_type": "dinner", "menus": ["메뉴"]}]}]
    }
    client.post("/api/meals/recommend", json={
        "period": "today", "dates": ["2026-03-23"],
        "meal_types": ["dinner"], "available_ingredients": "", "use_school_meals": False,
    })
    client.put("/api/meals/approve")

    client.post("/api/shopping/items", json={"name": "수동항목"})
    mock_gemini.generate_shopping_list.return_value = {
        "items": [{"name": "자동항목", "quantity": "1개", "category": "기타"}]
    }
    client.post("/api/shopping/generate", json={"menus": ["메뉴"]})

    items = client.get("/api/shopping").json()["items"]
    names = [i["name"] for i in items]
    assert "수동항목" in names
    assert "자동항목" in names


def test_generate_shopping_requires_approval(client, mock_gemini):
    mock_gemini.recommend_meals.return_value = {
        "days": [{"date": "2026-03-23", "meals": [{"meal_type": "dinner", "menus": ["된장찌개"]}]}]
    }
    client.post("/api/meals/recommend", json={
        "period": "today", "dates": ["2026-03-23"],
        "meal_types": ["dinner"], "available_ingredients": "", "use_school_meals": False,
    })
    res = client.post("/api/shopping/generate", json={"menus": ["된장찌개"]})
    assert res.status_code == 403
    assert "승인" in res.json()["detail"]


def test_generate_shopping_after_approval(client, mock_gemini):
    mock_gemini.recommend_meals.return_value = {
        "days": [{"date": "2026-03-23", "meals": [{"meal_type": "dinner", "menus": ["된장찌개"]}]}]
    }
    client.post("/api/meals/recommend", json={
        "period": "today", "dates": ["2026-03-23"],
        "meal_types": ["dinner"], "available_ingredients": "", "use_school_meals": False,
    })
    client.put("/api/meals/approve")

    mock_gemini.generate_shopping_list.return_value = {
        "items": [{"name": "두부", "quantity": "1모", "category": "기타"}]
    }
    res = client.post("/api/shopping/generate", json={"menus": ["된장찌개"]})
    assert res.status_code == 200
    assert len(res.json()["items"]) == 1


def test_frequent_items_crud(client):
    res = client.post("/api/shopping/frequent", json={"name": "계란"})
    assert res.status_code == 200
    fid = res.json()["id"]

    frequents = client.get("/api/shopping/frequent").json()
    assert any(f["id"] == fid for f in frequents)

    client.delete(f"/api/shopping/frequent/{fid}")
    frequents = client.get("/api/shopping/frequent").json()
    assert not any(f["id"] == fid for f in frequents)
