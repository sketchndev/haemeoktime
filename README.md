# 해먹타임 (Haemeoktime)

AI 기반 식단 추천 및 레시피 관리 웹 애플리케이션

## 주요 기능

- **식단 추천** - 가족 구성원의 선호도와 알레르기를 고려한 맞춤형 식단 생성 (일간/주간)
- **AI 레시피 생성** - Google Gemini API를 활용한 레시피 자동 생성 및 스트리밍 응답
- **장보기 목록** - 식단 기반 자동 장보기 목록 생성 및 관리
- **학교 급식 연동** - 학교 급식 정보를 식단 추천에 반영
- **합쳐서 요리하기** - 여러 레시피를 동시에 조리하는 통합 조리법 생성
- **즐겨찾기** - 레시피 및 합쳐서 요리하기 결과 저장

## 기술 스택

| 구분 | 기술 |
|------|------|
| Frontend | React 19, Vite 8, Tailwind CSS, React Router |
| Backend | FastAPI, Uvicorn, SQLite |
| AI | Google Gemini API |

## 실행 방법

### 사전 요구사항

- Python 3.8+
- Node.js & npm
- Google Gemini API 키

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

`.env` 파일을 `backend/` 디렉토리에 생성:

```
GEMINI_API_KEY=your_api_key_here
```

서버 실행:

```bash
python -m uvicorn main:app --reload
```

백엔드는 `http://localhost:8000`에서 실행됩니다.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

프론트엔드는 `http://localhost:5173`에서 실행됩니다.

## 프로젝트 구조

```
haemeoktime/
├── frontend/          # React 프론트엔드
│   ├── src/
│   │   ├── components/  # UI 컴포넌트
│   │   ├── contexts/    # React Context (프로필, 식단)
│   │   └── pages/       # 페이지 컴포넌트
│   └── package.json
├── backend/           # FastAPI 백엔드
│   ├── main.py          # 앱 진입점 및 API 라우트
│   ├── database.py      # SQLite DB 관리
│   └── requirements.txt
└── wireframe/         # 와이어프레임
```
