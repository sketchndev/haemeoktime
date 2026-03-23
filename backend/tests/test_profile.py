
def test_get_profile_returns_defaults(client):
    res = client.get("/api/profile")
    assert res.status_code == 200
    body = res.json()
    assert body["cooking_times"] == {"breakfast": 15, "lunch": 30, "dinner": 40}
    assert body["family_tags"] == []
    assert body["condiments"] == []


def test_add_and_list_family_tag(client):
    res = client.post("/api/profile/family-tags", json={"tag": "허리디스크"})
    assert res.status_code == 200
    assert res.json()["tag"] == "허리디스크"

    res = client.get("/api/profile/family-tags")
    assert any(t["tag"] == "허리디스크" for t in res.json())


def test_delete_family_tag(client):
    tag_id = client.post("/api/profile/family-tags", json={"tag": "8살아이"}).json()["id"]
    res = client.delete(f"/api/profile/family-tags/{tag_id}")
    assert res.status_code == 200

    tags = client.get("/api/profile/family-tags").json()
    assert not any(t["id"] == tag_id for t in tags)


def test_add_and_delete_condiment(client):
    res = client.post("/api/profile/condiments", json={"name": "간장"})
    assert res.status_code == 200
    cid = res.json()["id"]

    client.delete(f"/api/profile/condiments/{cid}")
    condiments = client.get("/api/profile/condiments").json()
    assert not any(c["id"] == cid for c in condiments)


def test_update_cooking_times(client):
    res = client.put("/api/profile/cooking-times", json={"breakfast": 10, "lunch": 20, "dinner": 50})
    assert res.status_code == 200

    profile = client.get("/api/profile").json()
    assert profile["cooking_times"]["dinner"] == 50


def test_condiment_photo_calls_gemini(client, mock_gemini):
    mock_gemini.parse_condiment_photo.return_value = {"extracted": ["간장", "된장"]}
    res = client.post(
        "/api/profile/condiments/photo",
        files={"file": ("test.jpg", b"fake-image-data", "image/jpeg")},
    )
    assert res.status_code == 200
    assert "간장" in res.json()["extracted"]


def test_condiment_photo_gemini_failure_returns_503(client, mock_gemini):
    mock_gemini.parse_condiment_photo.side_effect = Exception("Gemini 호출 실패")
    res = client.post(
        "/api/profile/condiments/photo",
        files={"file": ("test.jpg", b"fake", "image/jpeg")},
    )
    assert res.status_code == 503


def test_get_profile_includes_meal_plan_settings(client):
    res = client.get("/api/profile")
    assert res.status_code == 200
    body = res.json()
    assert "meal_plan_settings" in body
    assert body["meal_plan_settings"] == {"weekly_rule": "", "composition_rule": ""}


def test_get_meal_plan_settings_returns_defaults(client):
    res = client.get("/api/profile/meal-plan-settings")
    assert res.status_code == 200
    assert res.json() == {"weekly_rule": "", "composition_rule": ""}


def test_update_meal_plan_settings_persists(client):
    res = client.put("/api/profile/meal-plan-settings", json={
        "weekly_rule": "주말 점심만 양식",
        "composition_rule": "한식은 국+반찬 2개",
    })
    assert res.status_code == 200

    res = client.get("/api/profile/meal-plan-settings")
    assert res.json()["weekly_rule"] == "주말 점심만 양식"
    assert res.json()["composition_rule"] == "한식은 국+반찬 2개"


def test_update_meal_plan_settings_reflected_in_get_profile(client):
    client.put("/api/profile/meal-plan-settings", json={
        "weekly_rule": "평일 한식",
        "composition_rule": "",
    })
    profile = client.get("/api/profile").json()
    assert profile["meal_plan_settings"]["weekly_rule"] == "평일 한식"


def test_update_meal_plan_settings_too_long_returns_422(client):
    res = client.put("/api/profile/meal-plan-settings", json={
        "weekly_rule": "x" * 501,
        "composition_rule": "",
    })
    assert res.status_code == 422
