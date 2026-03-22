import json
import pytest
from unittest.mock import patch, MagicMock
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from services.gemini import GeminiService


@pytest.fixture
def svc():
    return GeminiService(api_key="test-key")


def mock_gemini_response(data: dict):
    m = MagicMock()
    m.text = json.dumps(data, ensure_ascii=False)
    return m


def test_recommend_meals_returns_days(svc):
    fake = {"days": [{"date": "2026-03-23", "meals": [{"meal_type": "dinner", "menus": ["된장찌개"]}]}]}
    with patch.object(svc.client.models, "generate_content", return_value=mock_gemini_response(fake)):
        result = svc.recommend_meals(
            dates=["2026-03-23"], meal_types=["dinner"],
            family_tags=[], condiments=[], meal_history=[],
            school_meals={}, cooking_times={"breakfast": 15, "lunch": 30, "dinner": 40},
            available_ingredients="",
        )
    assert result["days"][0]["date"] == "2026-03-23"


def test_generate_recipe_includes_calories(svc):
    fake = {
        "menu_name": "된장찌개", "servings": 2, "calories": 180,
        "ingredients": [{"name": "두부", "amount": "1/2모"}],
        "steps": ["물을 끓인다"], "health_notes": None,
    }
    with patch.object(svc.client.models, "generate_content", return_value=mock_gemini_response(fake)):
        result = svc.generate_recipe(menu_name="된장찌개", servings=2, family_tags=[], main_ingredient_weight=None)
    assert result["calories"] == 180
    assert result["ingredients"][0]["name"] == "두부"


def test_gemini_failure_raises_with_prefix(svc):
    with patch.object(svc.client.models, "generate_content", side_effect=Exception("network error")):
        with pytest.raises(Exception, match="Gemini"):
            svc.recommend_meals([], [], [], [], [], {}, {}, "")


def test_invalid_json_response_raises(svc):
    m = MagicMock()
    m.text = "not json"
    with patch.object(svc.client.models, "generate_content", return_value=m):
        with pytest.raises(Exception, match="파싱"):
            svc.recommend_meals([], [], [], [], [], {}, {}, "")
