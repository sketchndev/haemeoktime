import json
import pytest
from unittest.mock import patch, MagicMock

from services.gemini import GeminiService


@pytest.fixture
def svc():
    return GeminiService(api_key="test-key")


def mock_gemini_response(data: dict):
    m = MagicMock()
    m.text = json.dumps(data, ensure_ascii=False)
    return m


def test_parse_condiment_photo(svc):
    fake = {"extracted": ["간장", "된장"]}
    with patch.object(svc.client.models, "generate_content", return_value=mock_gemini_response(fake)):
        result = svc.parse_condiment_photo(b"fake_image", "image/jpeg")
    assert result["extracted"] == ["간장", "된장"]


def test_parse_school_meal_photo(svc):
    fake = {"days": [{"date": "2026-03-23", "menu_items": ["비빔밥", "미역국"]}]}
    with patch.object(svc.client.models, "generate_content", return_value=mock_gemini_response(fake)):
        result = svc.parse_school_meal_photo(b"fake_image", "image/jpeg")
    assert result["days"][0]["date"] == "2026-03-23"
    assert "비빔밥" in result["days"][0]["menu_items"]


def test_gemini_failure_raises_with_prefix(svc):
    with patch.object(svc.client.models, "generate_content", side_effect=Exception("network error")):
        with pytest.raises(Exception, match="Gemini"):
            svc.parse_condiment_photo(b"fake_image", "image/jpeg")


def test_invalid_json_response_raises(svc):
    m = MagicMock()
    m.text = "not json"
    with patch.object(svc.client.models, "generate_content", return_value=m):
        with pytest.raises(Exception, match="파싱"):
            svc.parse_condiment_photo(b"fake_image", "image/jpeg")
