import json
import os
from typing import Optional

from google import genai
from google.genai import types


class GeminiService:
    def __init__(self, api_key: str):
        self.client = genai.Client(api_key=api_key)
        self.model = "gemini-2.5-flash"
        self.config = types.GenerateContentConfig(
            response_mime_type="application/json"
        )

    def _call(self, prompt: str | list) -> dict:
        try:
            response = self.client.models.generate_content(
                model=self.model,
                contents=prompt,
                config=self.config,
            )
            return json.loads(response.text)
        except json.JSONDecodeError as e:
            raise Exception(f"Gemini 응답 파싱 실패: {e}") from e
        except Exception as e:
            raise Exception(f"Gemini 호출 실패: {e}") from e

    def recommend_meals(
        self, dates: list, meal_types: list, family_tags: list,
        condiments: list, meal_history: list, school_meals: dict,
        cooking_times: dict, available_ingredients: str,
        weekly_rule: str = "",
        composition_rule: str = "",
    ) -> dict:
        rule_lines = ""
        if weekly_rule:
            rule_lines += f"\n주간 구성 규칙: {weekly_rule}"
        if composition_rule:
            rule_lines += f"\n한끼 구성 규칙: {composition_rule}"

        prompt = f"""당신은 한국 가정 식단 전문가입니다. 아래 조건에 맞는 식단을 추천하고 유효한 JSON만 반환하세요.

날짜: {dates}
끼니: {meal_types}
가족 상황: {family_tags or '없음'}
보유 조미료: {condiments or '기본 조미료'}
최근 식단 이력(겹침 방지): {meal_history or '없음'}
급식 메뉴(해당 날짜 제외 처리): {school_meals or '없음'}
끼니별 최대 요리 시간: {cooking_times}
집에 있는 재료: {available_ingredients or '없음'}{rule_lines}

규칙:
- 흰쌀밥, 김치, 깍두기 등 상시 보유 반찬 제외
- 끼니별 최대 요리 시간 준수
- 이력과 겹치지 않게

응답 형식:
{{"days": [{{"date": "YYYY-MM-DD", "meals": [{{"meal_type": "breakfast|lunch|dinner", "menus": ["메뉴명"]}}]}}]}}"""
        return self._call(prompt)

    def re_recommend_single(
        self, date: str, meal_type: str, exclude_menu: str,
        existing_menus: list, family_tags: list, condiments: list, max_minutes: int,
    ) -> dict:
        prompt = f"""한국 가정 식단 전문가입니다. '{exclude_menu}'만 교체하는 메뉴 1개를 추천하세요. JSON만 반환.

날짜: {date}, 끼니: {meal_type}
같은 끼니 유지 메뉴: {existing_menus}
가족 상황: {family_tags}, 조미료: {condiments}, 최대 요리시간: {max_minutes}분

응답 형식: {{"menu_name": "새메뉴명"}}"""
        return self._call(prompt)

    def re_recommend_meal_type(
        self, date: str, meal_type: str, family_tags: list,
        condiments: list, max_minutes: int, meal_history: list,
        composition_rule: str = "",
    ) -> dict:
        composition_line = f"\n한끼 구성 규칙: {composition_rule}" if composition_rule else ""
        prompt = f"""한국 가정 식단 전문가입니다. {date} {meal_type} 끼니 전체를 재추천하세요. JSON만 반환.

가족 상황: {family_tags}, 조미료: {condiments}, 최대 요리시간: {max_minutes}분
최근 이력(겹침 방지): {meal_history}{composition_line}
규칙: 흰쌀밥, 김치, 깍두기 제외

응답 형식: {{"menus": ["메뉴명1", "메뉴명2"]}}"""
        return self._call(prompt)

    def generate_recipe(
        self, menu_name: str, servings: int, family_tags: list,
        main_ingredient_weight: Optional[int],
    ) -> dict:
        weight_str = f"주재료 {main_ingredient_weight}g 기준으로 " if main_ingredient_weight else ""
        prompt = f"""한국 가정 식단 전문가입니다. '{menu_name}' 레시피를 {weight_str}{servings}인분으로 작성하세요. JSON만 반환.

가족 상황: {family_tags}
규칙: 큰술/작은술 사용(T/t 사용 금지), 칼로리는 추정값, 건강 상황 반영

응답 형식:
{{"menu_name": "string", "servings": 숫자, "calories": 숫자,
  "ingredients": [{{"name": "string", "amount": "string"}}],
  "steps": ["string"], "health_notes": "string 또는 null"}}"""
        return self._call(prompt)

    def generate_combined_cooking(self, menus: list, family_tags: list) -> dict:
        prompt = f"""한국 가정 식단 전문가입니다. 다음 메뉴를 동시에 조리하는 최적화된 순서를 만드세요. JSON만 반환.

메뉴: {menus}
가족 상황: {family_tags}
대기 시간(불리기, 끓이기 등)을 활용해 병렬 조리 최적화.

응답 형식:
{{"total_minutes": 숫자, "optimized_minutes": 숫자,
  "steps": [{{"label": "단계명", "menu_tag": "메뉴명", "description": "설명"}}]}}"""
        return self._call(prompt)

    def generate_shopping_list(self, menus: list, condiments: list) -> dict:
        prompt = f"""한국 가정 식단 전문가입니다. 장보기 목록을 만드세요. JSON만 반환.

메뉴: {menus}
이미 보유한 조미료(제외): {condiments}
카테고리: 채소/과일, 육류/해산물, 유제품/계란, 가공식품, 기타

응답 형식: {{"items": [{{"name": "string", "quantity": "string", "category": "string"}}]}}"""
        return self._call(prompt)

    def parse_condiment_photo(self, image_bytes: bytes, mime_type: str) -> dict:
        prompt = '이 사진의 조미료/양념 이름을 모두 추출하세요. JSON만 반환. 형식: {"extracted": ["이름1", "이름2"]}'
        contents = [
            types.Part.from_bytes(data=image_bytes, mime_type=mime_type),
            prompt,
        ]
        return self._call(contents)

    def parse_school_meal_photo(self, image_bytes: bytes, mime_type: str) -> dict:
        prompt = '급식표 사진에서 날짜별 메뉴를 추출하세요. JSON만 반환. 형식: {"days": [{"date": "YYYY-MM-DD", "menu_items": ["메뉴1"]}]}'
        contents = [
            types.Part.from_bytes(data=image_bytes, mime_type=mime_type),
            prompt,
        ]
        return self._call(contents)


def get_gemini() -> GeminiService:
    """FastAPI Depends 용."""
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY environment variable is not set")
    return GeminiService(api_key=api_key)
