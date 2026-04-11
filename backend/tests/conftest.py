import os
import pytest
from fastapi.testclient import TestClient
from unittest.mock import MagicMock


@pytest.fixture(autouse=True)
def set_test_db(tmp_path, monkeypatch):
    db_file = str(tmp_path / "test.db")
    monkeypatch.setenv("DB_PATH", db_file)
    from database import init_db
    init_db(db_file)
    return db_file


@pytest.fixture
def client():
    from main import app
    return TestClient(app)


@pytest.fixture
def mock_gemini(client):
    """Gemini 의존성을 mock으로 교체하는 픽스처 (이미지 분석용)."""
    from main import app
    from services.gemini import get_gemini

    mock = MagicMock()
    app.dependency_overrides[get_gemini] = lambda: mock
    yield mock
    app.dependency_overrides.pop(get_gemini, None)


@pytest.fixture
def mock_openai(client):
    """OpenAI 의존성을 mock으로 교체하는 픽스처."""
    from main import app
    from services.openai_service import get_openai

    mock = MagicMock()
    app.dependency_overrides[get_openai] = lambda: mock
    yield mock
    app.dependency_overrides.pop(get_openai, None)
