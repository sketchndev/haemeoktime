def _fake_recipe(menu="된장찌개", servings=2):
    return {
        "menu_name": menu, "servings": servings, "calories": 200,
        "ingredients": [{"name": "두부", "amount": "1/2모"}],
        "steps": ["물을 끓인다"],
    }


def test_generate_recipe(client, mock_openai):
    mock_openai.generate_recipe.return_value = _fake_recipe()
    res = client.post("/api/recipes/generate", json={
        "menu_name": "된장찌개", "servings": 2, "main_ingredient_weight": None,
    })
    assert res.status_code == 200
    body = res.json()
    assert body["calories"] == 200
    assert body["ingredients"][0]["name"] == "두부"


def test_generate_recipe_openai_failure_returns_503(client, mock_openai):
    mock_openai.generate_recipe.side_effect = Exception("OpenAI 호출 실패")
    res = client.post("/api/recipes/generate", json={"menu_name": "X", "servings": 1})
    assert res.status_code == 503


def test_combined_cooking(client, mock_openai):
    mock_openai.generate_combined_cooking.return_value = {
        "total_minutes": 60, "optimized_minutes": 40,
        "steps": [{"label": "1단계", "menu_tag": "된장찌개", "description": "물 올리기"}],
    }
    res = client.post("/api/recipes/combined-cooking", json={
        "date": "2026-03-23", "meal_type": "dinner", "menus": ["된장찌개", "시금치나물"],
    })
    assert res.status_code == 200
    assert res.json()["optimized_minutes"] == 40


def test_add_and_list_favorite(client):
    res = client.post("/api/recipes/favorites", json={"menu_name": "된장찌개"})
    assert res.status_code == 200
    fid = res.json()["id"]

    favs = client.get("/api/recipes/favorites").json()
    assert any(f["id"] == fid for f in favs)


def test_delete_favorite(client):
    fid = client.post("/api/recipes/favorites", json={"menu_name": "비빔밥"}).json()["id"]
    client.delete(f"/api/recipes/favorites/{fid}")

    favs = client.get("/api/recipes/favorites").json()
    assert not any(f["id"] == fid for f in favs)


def test_add_favorite_with_recipe_data(client):
    recipe_data = {
        "menu_name": "된장찌개", "servings": 2, "calories": 200,
        "ingredients": [{"name": "두부", "amount": "1/2모"}],
        "steps": ["물을 끓인다"],
    }
    res = client.post("/api/recipes/favorites", json={
        "menu_name": "된장찌개",
        "recipe_type": "individual",
        "recipe_data": recipe_data,
    })
    assert res.status_code == 200
    body = res.json()
    assert body["recipe_type"] == "individual"
    assert body["recipe_data"]["calories"] == 200


def test_add_combined_favorite(client):
    combined_data = {
        "total_minutes": 60, "optimized_minutes": 40,
        "menus": ["된장찌개", "시금치나물"],
        "ingredients": [{"menu": "된장찌개", "items": [{"name": "두부", "amount": "1/2모"}]}],
        "steps": [{"label": "1단계", "menu_tag": "된장찌개", "description": "물 올리기"}],
    }
    res = client.post("/api/recipes/favorites", json={
        "menu_name": "된장찌개 + 시금치나물",
        "recipe_type": "combined",
        "recipe_data": combined_data,
    })
    assert res.status_code == 200
    assert res.json()["recipe_type"] == "combined"


def test_list_favorites_includes_recipe_data(client):
    recipe_data = {"calories": 300, "ingredients": [], "steps": []}
    client.post("/api/recipes/favorites", json={
        "menu_name": "비빔밥", "recipe_type": "individual", "recipe_data": recipe_data,
    })
    favs = client.get("/api/recipes/favorites").json()
    fav = next(f for f in favs if f["menu_name"] == "비빔밥")
    assert fav["recipe_data"]["calories"] == 300
    assert fav["recipe_type"] == "individual"


def test_add_favorite_without_recipe_data_backward_compat(client):
    res = client.post("/api/recipes/favorites", json={"menu_name": "김치찌개"})
    assert res.status_code == 200
    body = res.json()
    assert body["recipe_type"] == "individual"
    assert body["recipe_data"] is None
