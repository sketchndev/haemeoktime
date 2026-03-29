from pydantic import BaseModel, Field
from typing import Optional


# ── Profile ──────────────────────────────────────────────

class CookingTimes(BaseModel):
    breakfast: int
    lunch: int
    dinner: int


class TagCreate(BaseModel):
    tag: str


class TagResponse(BaseModel):
    id: int
    tag: str


class CondimentCreate(BaseModel):
    name: str


class CondimentResponse(BaseModel):
    id: int
    name: str


class MealPlanSettings(BaseModel):
    weekly_rule: str = Field("", max_length=500)
    composition_rule: str = Field("", max_length=500)


class ProfileResponse(BaseModel):
    family_tags: list[TagResponse]
    condiments: list[CondimentResponse]
    cooking_times: CookingTimes
    meal_plan_settings: MealPlanSettings


# ── Meals ────────────────────────────────────────────────

class RecommendRequest(BaseModel):
    period: str                          # "today" | "week" | "custom"
    dates: list[str] = []               # period="custom" 일 때 날짜 목록
    meal_types: list[str]               # ["breakfast", "lunch", "dinner"]
    available_ingredients: str = ""
    use_school_meals: bool = False


class MenuItem(BaseModel):
    history_id: int
    name: str
    main_ingredient: Optional[str] = None
    main_ingredient_unit: Optional[str] = None


class MealSlot(BaseModel):
    meal_type: str
    is_school_meal: bool = False
    menus: list[MenuItem]


class DayPlan(BaseModel):
    date: str
    meals: list[MealSlot]


class RecommendResponse(BaseModel):
    days: list[DayPlan]


class SingleReRecommendRequest(BaseModel):
    date: str
    meal_type: str
    history_id: int                      # 교체할 meal_history 행 PK
    menu_name: str
    max_minutes_override: Optional[int] = None
    existing_menus: list[str] = []


class MealTypeReRecommendRequest(BaseModel):
    date: str
    meal_type: str
    max_minutes_override: Optional[int] = None
    existing_history_ids: list[int] = []


class SwapDatesRequest(BaseModel):
    date1: str
    date2: str


class UpdateHistoryRequest(BaseModel):
    menu_name: str


# ── Recipes ──────────────────────────────────────────────

class RecipeRequest(BaseModel):
    menu_name: str
    servings: int
    main_ingredient_weight: Optional[int] = None
    user_context: Optional[str] = None


class Ingredient(BaseModel):
    name: str
    amount: str


class RecipeResponse(BaseModel):
    menu_name: str
    servings: int
    calories: int
    cooking_time: Optional[int] = None
    main_ingredient: Optional[str] = None
    main_ingredient_unit: Optional[str] = None
    ingredients: list[Ingredient]
    steps: list[str]


class ExtractMainIngredientsRequest(BaseModel):
    menus: list[str]


class CombinedCookingRequest(BaseModel):
    date: str
    meal_type: str
    menus: list[str]
    servings: Optional[int] = None
    main_ingredient_weights: Optional[dict[str, str]] = None
    user_context: Optional[str] = None


class CookingStep(BaseModel):
    label: str
    menu_tag: str
    description: str


class CombinedCookingResponse(BaseModel):
    total_minutes: int
    optimized_minutes: int
    steps: list[CookingStep]


class FavoriteCreate(BaseModel):
    menu_name: str
    recipe_type: str = "individual"
    recipe_data: Optional[dict] = None


class FavoriteResponse(BaseModel):
    id: int
    menu_name: str
    recipe_type: str = "individual"
    recipe_data: Optional[dict] = None


# ── Shopping ─────────────────────────────────────────────

class ShoppingItemCreate(BaseModel):
    name: str
    quantity: Optional[str] = None
    category: Optional[str] = None


class ShoppingItemResponse(BaseModel):
    id: int
    name: str
    quantity: Optional[str]
    category: Optional[str]
    is_checked: bool
    is_auto: bool


class ShoppingResponse(BaseModel):
    week_start: str
    items: list[ShoppingItemResponse]


class ShoppingGenerateRequest(BaseModel):
    menus: list[str]


class ShoppingCheckRequest(BaseModel):
    is_checked: bool


class FrequentItemCreate(BaseModel):
    name: str


class FrequentItemResponse(BaseModel):
    id: int
    name: str


# ── School Meals ──────────────────────────────────────────

class SchoolMealDay(BaseModel):
    date: str
    menu_items: list[str]
