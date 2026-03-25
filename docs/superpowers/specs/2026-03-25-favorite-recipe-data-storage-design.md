# 즐겨찾기 레시피 데이터 저장 설계

## 요약

즐겨찾기에 레시피 데이터를 함께 저장하여 AI 재질의 없이 바로 조회할 수 있도록 개선한다.
함께 요리하기(combined cooking) 결과도 즐겨찾기로 저장할 수 있도록 확장한다.

## 현재 문제

1. `favorite_recipes` 테이블에 `menu_name`만 저장 → 레시피 조회 시 매번 Gemini AI 재질의 필요
2. 함께 요리하기 결과를 즐겨찾기로 저장하는 기능이 없음

## 설계

### DB 변경

`favorite_recipes` 테이블에 2개 컬럼 추가:

```sql
ALTER TABLE favorite_recipes ADD COLUMN recipe_type TEXT NOT NULL DEFAULT 'individual';
ALTER TABLE favorite_recipes ADD COLUMN recipe_data TEXT;
```

- `recipe_type`: 'individual' (개별 레시피) 또는 'combined' (함께 요리하기)
- `recipe_data`: 레시피 전체 정보를 JSON 문자열로 저장. NULL이면 기존 방식(AI 질의)으로 폴백

### Backend 모델 변경

```python
class FavoriteCreate(BaseModel):
    menu_name: str
    recipe_type: str = "individual"  # "individual" | "combined"
    recipe_data: dict | None = None  # 레시피 전체 JSON

class FavoriteResponse(BaseModel):
    id: int
    menu_name: str
    recipe_type: str
    recipe_data: dict | None
```

### Backend 엔드포인트

기존 엔드포인트 유지, 새 필드만 추가 저장/반환:

- **POST `/recipes/favorites`**: `recipe_type`, `recipe_data` 함께 저장
- **GET `/recipes/favorites`**: `recipe_type`, `recipe_data` 포함하여 반환
- **DELETE `/recipes/favorites/{fid}`**: 변경 없음

### Frontend API 변경

```javascript
// recipes.js
export const addFavorite = (menuName, recipeType = 'individual', recipeData = null) =>
  client.post('/recipes/favorites', {
    menu_name: menuName,
    recipe_type: recipeType,
    recipe_data: recipeData,
  })
```

### Frontend 컴포넌트 변경

**RecipeDetail.jsx**:
- 즐겨찾기 추가 시 현재 로드된 레시피 데이터(ingredients, steps, calories, health_notes)를 함께 저장
- 즐겨찾기에서 진입 시 (`recipe_data`가 있으면) AI 재질의 없이 저장된 데이터로 표시

**CombinedCooking.jsx**:
- 결과 화면에 즐겨찾기(♥) 버튼 추가
- 클릭 시 메뉴 조합명(예: "쭈꾸미볶음 + 계란찜")과 통합 조리법 전체 데이터를 저장

**RecipesPage.jsx**:
- 즐겨찾기 목록에 `recipe_type` 표시 (개별/함께요리 구분)
- 클릭 시:
  - `recipe_data`가 있으면 저장된 데이터로 바로 표시
  - `recipe_data`가 없으면 기존처럼 AI 질의 (하위 호환)

## 데이터 흐름

```
[즐겨찾기 추가]
RecipeDetail (♥ 클릭) → addFavorite(menuName, 'individual', recipeData) → POST /recipes/favorites → DB 저장
CombinedCooking (♥ 클릭) → addFavorite(combinedName, 'combined', resultData) → POST /recipes/favorites → DB 저장

[즐겨찾기 조회]
RecipesPage → getFavorites() → GET /recipes/favorites → recipe_data 포함 반환
클릭 → recipe_data 있으면 바로 표시 / 없으면 AI 질의 폴백
```
