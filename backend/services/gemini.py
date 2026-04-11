import json
import os

from google import genai
from google.genai import types
from google.genai.errors import ClientError


class GeminiService:
    """이미지 분석 전용 서비스 (조미료 사진, 급식표 사진)."""

    def __init__(self, api_key: str):
        self.client = genai.Client(api_key=api_key)
        self.model = "gemini-3-flash-preview"
        self.config = types.GenerateContentConfig(
            response_mime_type="application/json"
        )

    def _call(self, prompt: str | list, config=None) -> dict:
        try:
            response = self.client.models.generate_content(
                model=self.model,
                contents=prompt,
                config=config or self.config,
            )
            return json.loads(response.text)
        except json.JSONDecodeError as e:
            raise Exception(f"Gemini 응답 파싱 실패: {e}") from e
        except ClientError as e:
            if e.code == 429:
                raise Exception("AI API 할당량이 부족합니다.") from e
            raise Exception(f"Gemini 호출 실패: {e}") from e
        except Exception as e:
            raise Exception(f"Gemini 호출 실패: {e}") from e

    # ── 조미료 사진 인식 ──────────────────────────────────

    def parse_condiment_photo(self, image_bytes: bytes, mime_type: str) -> dict:
        prompt = """# 작업
이 사진에 보이는 조미료/양념의 이름을 모두 추출하세요.
라벨이 보이면 라벨 기준, 안 보이면 용기 형태로 추정하세요.

# 응답 (JSON만)
{"extracted": ["조미료명1", "조미료명2"]}"""
        contents = [
            types.Part.from_bytes(data=image_bytes, mime_type=mime_type),
            prompt,
        ]
        return self._call(contents)

    # ── 급식표 사진 인식 ──────────────────────────────────

    def parse_school_meal_photo(self, image_bytes: bytes, mime_type: str) -> dict:
        prompt = """# 작업
급식표 이미지 또는 PDF에서 날짜별 메뉴를 추출하세요.
날짜는 YYYY-MM-DD 형식으로 변환하고, 각 메뉴를 개별 항목으로 분리하세요.

# 응답 (JSON만)
{"days": [{"date": "YYYY-MM-DD", "menu_items": ["메뉴1", "메뉴2"]}]}"""
        contents = [
            types.Part.from_bytes(data=image_bytes, mime_type=mime_type),
            prompt,
        ]
        return self._call(contents)


def get_gemini() -> GeminiService:
    """FastAPI Depends 용. 이미지 분석 전용."""
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY environment variable is not set")
    return GeminiService(api_key=api_key)
