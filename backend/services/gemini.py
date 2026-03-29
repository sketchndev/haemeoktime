import json
import os
import re
from typing import Optional

from google import genai
from google.genai import types


def _parse_menu_count(composition_rule: str) -> int:
    """composition_rule에서 숫자+개 패턴을 추출해 합산. 예: '국 1개 반찬 2개' → 3"""
    nums = re.findall(r'(\d+)\s*개', composition_rule)
    return sum(int(n) for n in nums) if nums else 0


def _build_example_menus(count: int) -> str:
    """few-shot용 예시 menus 배열 문자열 생성"""
    if count <= 0:
        count = 2
    examples = []
    sample_ingredients = [("소고기", "g"), ("두부", "모"), ("시금치", "g"), ("계란", "개"), ("돼지고기", "g")]
    for i in range(count):
        ing, unit = sample_ingredients[i % len(sample_ingredients)]
        examples.append(f'{{"name": "예시메뉴{i+1}", "main_ingredient": "{ing}", "main_ingredient_unit": "{unit}"}}')
    return ', '.join(examples)


class GeminiService:
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
        except Exception as e:
            raise Exception(f"Gemini 호출 실패: {e}") from e

    def _call_stream(self, prompt: str | list, config=None):
        """Gemini 스트리밍 호출. (chunk_index, accumulated_text) 를 yield 한 뒤
        마지막에 파싱된 dict를 반환하는 generator.
        사용법:
            gen = service._call_stream(prompt)
            for chunk_idx, _ in gen:
                ...  # progress 전송
            result = gen.return_value   (StopIteration.value)
        """
        try:
            chunks = []
            for i, chunk in enumerate(self.client.models.generate_content_stream(
                model=self.model,
                contents=prompt,
                config=config or self.config,
            )):
                text = chunk.text or ""
                chunks.append(text)
                yield i, "".join(chunks)
            full_text = "".join(chunks)
            return json.loads(full_text)
        except json.JSONDecodeError as e:
            raise Exception(f"Gemini 응답 파싱 실패: {e}") from e
        except Exception as e:
            raise Exception(f"Gemini 호출 실패: {e}") from e

    # ── 식단 추천 (메인) ──────────────────────────────────

    def build_recommend_prompt(
        self, dates: list, meal_types: list, family_tags: list,
        condiments: list, meal_history: list, school_meals: dict,
        cooking_times: dict, available_ingredients: str,
        weekly_rule: str = "",
        composition_rule: str = "",
    ) -> str:
        composition_block = ""
        if composition_rule:
            total = _parse_menu_count(composition_rule)
            count_hint = f"menus 배열에 정확히 {total}개 항목" if total else "menus 배열 항목 수를 규칙에 맞게"
            composition_block = f"""

[최우선 제약: 한끼 구성]
사용자 설정: "{composition_rule}"
→ 각 끼니의 {count_hint}만 넣으세요. 1개라도 초과/부족하면 오답입니다."""

        optional_rules = ""
        if weekly_rule:
            optional_rules = f"\n6. 주간 구성: {weekly_rule}"

        ex_date = dates[0] if dates else "2026-01-01"
        ex_mt = meal_types[0] if meal_types else "dinner"
        menu_count = _parse_menu_count(composition_rule) if composition_rule else 2
        ex_menus = _build_example_menus(menu_count)

        return f"""# 역할
가정 식단 전문가. 가족 건강·취향을 고려한 영양 균형 잡힌 가정식을 추천합니다.

# 입력
- 날짜: {dates}
- 끼니: {meal_types}
- 가족: {family_tags or '없음'}
- 보유 조미료: {condiments or '기본 조미료'}
- 최근 2주 이력(겹침 방지): {meal_history or '없음'}
- 급식(해당 날짜 점심 제외): {school_meals or '없음'}
- 끼니별 최대 총 조리 시간: {cooking_times} (한 끼의 모든 메뉴 조리 시간 합계가 이 시간 이내여야 함)
- 집에 있는 재료(참고용): {available_ingredients or '없음'}
{composition_block}

# 규칙 (모두 준수)
1. 흰쌀밥·김치·깍두기 등 상비 반찬은 menus에 포함하지 않기
2. 한 끼니의 모든 메뉴 조리 시간 합계가 해당 끼니 최대 시간 이내여야 함 (예: 최대 30분이면 메뉴 3개의 조리 시간 합이 30분 이내)
3. 최근 2주 이력과 중복 금지
4. 집에 있는 재료가 있으면 일부 메뉴에 활용하되, 반드시 그 재료만 사용할 필요는 없음. 다양한 메뉴를 자유롭게 추천
5. 급식 있는 날 점심은 급식 메뉴와 겹치지 않게{optional_rules}
6. 각 메뉴에 main_ingredient(핵심 재료 1가지)와 main_ingredient_unit(계량 단위) 포함
   - main_ingredient: 해당 요리의 핵심 재료 (예: 쭈꾸미볶음→쭈꾸미, 소불고기→소고기, 시금치나물→시금치)
   - main_ingredient_unit: 실제 계량 단위 (고기/채소→g, 계란→개, 두부→모)

# 응답 (JSON만, 설명 없이)
예시:
{{"days": [{{"date": "{ex_date}", "meals": [{{"meal_type": "{ex_mt}", "menus": [{ex_menus}]}}]}}]}}

모든 날짜·끼니를 빠짐없이 생성하세요."""

    def recommend_meals(
        self, dates: list, meal_types: list, family_tags: list,
        condiments: list, meal_history: list, school_meals: dict,
        cooking_times: dict, available_ingredients: str,
        weekly_rule: str = "",
        composition_rule: str = "",
    ) -> dict:
        prompt = self.build_recommend_prompt(
            dates=dates, meal_types=meal_types, family_tags=family_tags,
            condiments=condiments, meal_history=meal_history, school_meals=school_meals,
            cooking_times=cooking_times, available_ingredients=available_ingredients,
            weekly_rule=weekly_rule, composition_rule=composition_rule,
        )
        return self._call(prompt)

    # ── 단일 메뉴 교체 ───────────────────────────────────

    def re_recommend_single(
        self, date: str, meal_type: str, exclude_menu: str,
        existing_menus: list, family_tags: list, condiments: list, max_minutes: int,
    ) -> dict:
        prompt = f"""# 역할
가정 식단 전문가.

# 작업
'{exclude_menu}'를 대체할 메뉴 **1개만** 추천하세요.

# 조건
- 날짜: {date}, 끼니: {meal_type}
- 같은 끼니에 유지되는 메뉴: {existing_menus} (이것들과 조화되는 메뉴 선택)
- 가족: {family_tags}, 조미료: {condiments}
- 이 메뉴의 조리 시간이 다른 메뉴와 합산해 총 {max_minutes}분 이내가 되도록 추천

# 응답 (JSON만)
{{"menu_name": "새메뉴명", "main_ingredient": "핵심재료명", "main_ingredient_unit": "계량단위(g/개/모 등)"}}"""
        return self._call(prompt)

    # ── 끼니 전체 재추천 ──────────────────────────────────

    def re_recommend_meal_type(
        self, date: str, meal_type: str, family_tags: list,
        condiments: list, max_minutes: int, meal_history: list,
        composition_rule: str = "",
    ) -> dict:
        composition_block = ""
        menu_count = 2
        if composition_rule:
            total = _parse_menu_count(composition_rule)
            if total:
                menu_count = total
            composition_block = f"""

[최우선 제약: 한끼 구성]
사용자 설정: "{composition_rule}"
→ menus 배열에 정확히 {menu_count}개 항목만 넣으세요. 초과/부족 시 오답."""

        ex_menus = _build_example_menus(menu_count)

        prompt = f"""# 역할
가정 식단 전문가.

# 작업
{date} {meal_type} 끼니를 완전히 새로 추천하세요.

# 조건
- 가족: {family_tags}, 조미료: {condiments}
- 최대 총 조리 시간: {max_minutes}분 (모든 메뉴 조리 시간 합계가 이 시간 이내)
- 최근 이력(겹침 방지): {meal_history}
- 흰쌀밥·김치·깍두기 제외
{composition_block}

# 응답 (JSON만)
예시: {{"menus": [{ex_menus}]}}"""
        return self._call(prompt)

    # ── 레시피 생성 ───────────────────────────────────────

    def build_recipe_prompt(
        self, menu_name: str, servings: int, family_tags: list,
        main_ingredient_weight: Optional[int],
        user_context: Optional[str] = None,
        saved_ingredients: Optional[list] = None,
    ) -> str:
        weight_str = f"주재료 {main_ingredient_weight}g 기준으로 " if main_ingredient_weight else ""
        context_block = f"\n\n# 사용자 상황\n{user_context}\n→ 위 상황을 반영하여 레시피를 조정하세요. 없는 재료는 대체재를 사용하거나 분량을 조정하세요." if user_context else ""
        ingredients_block = ""
        if saved_ingredients:
            ingredients_block = f"\n\n# 사용할 재료 (반드시 이 재료들로 레시피를 작성하세요)\n{json.dumps(saved_ingredients, ensure_ascii=False)}\n→ 위 재료 목록을 기반으로 {servings}인분에 맞게 분량을 조정하세요. 재료를 임의로 추가하거나 빼지 마세요."
        return f"""# 역할
가정 요리 전문가.

# 작업
'{menu_name}'의 {weight_str}{servings}인분 레시피를 작성하세요.

# 조건
- 가족: {family_tags}
- 계량은 큰술/작은술로 표기 (T/t/tsp/tbsp 등 영문 기호 사용 금지)
- 칼로리는 1인분 기준 추정값
- steps 배열: 재료 사용 시 반드시 분량 포함
- steps 예시: ["소고기 200g을 한입 크기로 썰어 준비", "팬에 식용유 1큰술 두르고 중불로 가열"]
{context_block}{ingredients_block}

# 응답 (JSON만)
{{"menu_name": "string", "servings": 숫자, "calories": 숫자,
  "cooking_time": 총 조리 시간(분 단위 정수),
  "main_ingredient": "주재료명 (예: 소고기, 두부, 시금치 등 이 요리의 핵심 재료 1가지)",
  "main_ingredient_unit": "해당 주재료의 자연스러운 계량 단위 (예: g, 개, 모 등)",
  "ingredients": [{{"name": "재료명", "amount": "계량"}}],
  "steps": ["조리 단계(재료명과 분량 포함)"]}}"""

    def generate_recipe(
        self, menu_name: str, servings: int, family_tags: list,
        main_ingredient_weight: Optional[int],
        user_context: Optional[str] = None,
        saved_ingredients: Optional[list] = None,
    ) -> dict:
        prompt = self.build_recipe_prompt(
            menu_name, servings, family_tags,
            main_ingredient_weight, user_context,
            saved_ingredients,
        )
        return self._call(prompt)

    # ── 메인 재료 추출 ──────────────────────────────────────

    def extract_main_ingredients(self, menus: list) -> dict:
        prompt = f"""# 작업
다음 메뉴들의 메인 재료(주재료) 이름과 적절한 계량 단위를 각각 추출하세요.
메인 재료란 해당 요리의 핵심이 되는 재료입니다 (예: 쭈꾸미볶음→쭈꾸미, 소불고기→소고기, 시금치나물→시금치).
단위는 해당 재료를 실제로 계량하는 방식에 맞게 선택하세요 (예: 고기/채소→g, 계란→개, 두부→모).

메뉴 목록: {menus}

# 응답 (JSON만)
{{"ingredients": [{{"menu": "메뉴명", "main_ingredient": "재료명", "unit": "단위"}}]}}"""
        return self._call(prompt)

    # ── 동시 조리 최적화 ──────────────────────────────────

    _combined_schema = {
        "type": "OBJECT",
        "properties": {
            "total_minutes": {"type": "INTEGER"},
            "optimized_minutes": {"type": "INTEGER"},
            "total_calories": {"type": "INTEGER"},
            "ingredients": {
                "type": "ARRAY",
                "items": {
                    "type": "OBJECT",
                    "properties": {
                        "menu": {"type": "STRING"},
                        "items": {
                            "type": "ARRAY",
                            "items": {
                                "type": "OBJECT",
                                "properties": {
                                    "name": {"type": "STRING"},
                                    "amount": {"type": "STRING"},
                                },
                                "required": ["name", "amount"],
                            },
                        },
                    },
                    "required": ["menu", "items"],
                },
            },
            "steps": {
                "type": "ARRAY",
                "items": {
                    "type": "OBJECT",
                    "properties": {
                        "label": {"type": "STRING"},
                        "menu_tag": {"type": "STRING"},
                        "actions": {
                            "type": "ARRAY",
                            "items": {"type": "STRING"},
                        },
                    },
                    "required": ["label", "menu_tag", "actions"],
                },
            },
        },
        "required": ["total_minutes", "optimized_minutes", "total_calories", "ingredients", "steps"],
    }

    def build_combined_cooking_prompt(self, menus: list, family_tags: list, servings: Optional[int] = None, main_ingredient_weights: Optional[dict] = None, user_context: Optional[str] = None):
        """프롬프트와 config를 반환. (prompt, config) tuple."""
        config = types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=self._combined_schema,
        )
        portion_lines = []
        if main_ingredient_weights:
            for menu, amount in main_ingredient_weights.items():
                portion_lines.append(f"- {menu}: 메인 재료 {amount} 기준으로 나머지 재료 분량 맞추기")
        menus_without_weight = [m for m in menus if not main_ingredient_weights or m not in main_ingredient_weights]
        if menus_without_weight and servings:
            portion_lines.append(f"- {', '.join(menus_without_weight)}: {servings}인분 기준")
        elif not portion_lines and servings:
            portion_lines.append(f"- 모든 메뉴: {servings}인분 기준")

        portion_block = ""
        if portion_lines:
            portion_block = "\n\n# 분량 기준\n" + "\n".join(portion_lines)

        prompt = f"""# 역할
가정 요리 전문가. 여러 메뉴의 동시 조리 순서를 최적화합니다.

# 작업
다음 메뉴를 동시에 조리하는 최적 순서를 만드세요: {menus}
{portion_block}

# 최적화 원칙
- 대기 시간(불리기, 끓이기, 절이기)에 다른 메뉴 작업 병행
- 가스레인지 구수, 사용 가능한 조리도구를 현실적으로 고려
- 시간이 지날 수록 식거나 질겨져서 맛이 떨어지는 요리는 마지막 단계로 배치
- 가족 상황: {family_tags}

# 중요
- total_calories: 모든 메뉴의 1인분 칼로리 합산 추정값 (정수)
- ingredients: 각 메뉴별 필요한 모든 재료와 정확한 분량을 빠짐없이 나열 (위 분량 기준에 맞게)
- 계량은 큰술/작은술로 표기 (T/t/tsp/tbsp 등 영문 기호 사용 금지)
- steps의 actions 배열: 한 동작을 한 문장으로 간단명료하게. 재료명에는 반드시 분량 포함
- actions 예시: ["시금치 300g 뿌리 부분 다듬기", "간장 2큰술, 설탕 1작은술 넣고 양념장 만들기", "냄비에 물 올려 끓이기"]
- 불필요한 부연설명, 팁, 괄호 안 보충설명은 생략"""
        if user_context:
            prompt += f"\n\n# 사용자 상황\n{user_context}\n→ 위 상황을 반영하여 재료와 조리 순서를 조정하세요. 없는 재료는 대체재를 사용하거나 분량을 조정하세요."
        return prompt, config

    def generate_combined_cooking(self, menus: list, family_tags: list, servings: Optional[int] = None, main_ingredient_weights: Optional[dict] = None, user_context: Optional[str] = None) -> dict:
        prompt, config = self.build_combined_cooking_prompt(menus, family_tags, servings, main_ingredient_weights, user_context)
        return self._call(prompt, config=config)

    # ── 장보기 목록 ───────────────────────────────────────

    def generate_shopping_list(self, menus: list, condiments: list, available_ingredients: str = "") -> dict:
        prompt = f"""# 역할
가정 식단 전문가.

# 작업
아래 메뉴들의 장보기 목록과 각 메뉴별 필요한 재료를 함께 만드세요: {menus}

# 조건
- 이미 보유한 조미료(제외): {condiments}
- 집에 이미 있는 재료(제외): {available_ingredients or '없음'}
- items: 여러 메뉴에 공통으로 필요한 재료는 합산하여 1개 항목으로
- items 카테고리: 채소/과일, 육류/해산물, 유제품/계란, 가공식품, 기타
- 계량은 큰술/작은술로 표기 (T/t/tsp/tbsp 등 영문 기호 사용 금지)
- menu_ingredients: 각 메뉴별로 필요한 모든 재료와 2인분 기준 분량 (합산 전 개별 목록, 조미료 포함)

# 응답 (JSON만)
{{"items": [{{"name": "재료명", "quantity": "수량", "category": "카테고리"}}],
  "menu_ingredients": [{{"menu": "메뉴명", "ingredients": [{{"name": "재료명", "amount": "분량"}}]}}]}}"""
        return self._call(prompt)

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
    """FastAPI Depends 용."""
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY environment variable is not set")
    return GeminiService(api_key=api_key)
