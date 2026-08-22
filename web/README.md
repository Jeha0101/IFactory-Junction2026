# IFactory — 웹 프론트엔드

Next.js(App Router) + TypeScript + Tailwind + Firebase(Firestore/Storage). 전체 프로젝트 맥락은
저장소 루트의 `IFactory개발명세초안.md`, 에이전트 스펙은 `Agent_요구사항명세서.md` 참고.

## 처음 클론했을 때 설정 순서

### 1. 클론
`main`에 최신 내용이 올라가 있습니다 (별도 브랜치 체크아웃 불필요).
```bash
git clone https://github.com/Jeha0101/IFactory-Junction2026.git
cd IFactory-Junction2026
```

### 2. 프론트엔드 의존성 설치
```bash
cd web
npm install
```

### 3. 환경변수 설정
```bash
cp .env.local.example .env.local
```
`.env.local`을 열어 아래 값을 채웁니다 (**깃허브에 안 올라가 있음 — 팀 채널/1Password 등 안전한 경로로 직접 전달받아야 함**):

| 변수 | 어디서 얻나 |
|---|---|
| `NEXT_PUBLIC_FIREBASE_*` (6개) | Firebase 콘솔 → 프로젝트 설정 → 내 앱(웹) |
| `UPSTAGE_API_KEY` | Upstage Studio 콘솔 → API keys |
| `AGENT_A_ID` / `AGENT_B_ID` | Upstage Studio → 각 에이전트 화면 → **Code** 버튼 |

⚠️ `NEXT_PUBLIC_` 접두사가 붙은 값은 브라우저에 그대로 노출됩니다 (Firebase 클라이언트 설정은 원래 공개돼도 되는 값). `UPSTAGE_API_KEY`/`AGENT_A_ID`/`AGENT_B_ID`는 접두사가 없어야 서버(API route)에서만 쓰이고 브라우저에 노출되지 않습니다 — 실수로 `NEXT_PUBLIC_`을 붙이지 마세요.

### 4. Python 유틸리티 (DOCX 구조 추출/채우기, HWP 변환)
저장소 루트의 `python/`에 있습니다. 프론트와 별개로 독립 실행되는 스크립트라 필요할 때만 설치하면 됩니다.
```bash
pip install -r ../python/requirements.txt
brew install --cask libreoffice   # HWP 변환 + 이력서 다운로드(export API)에 필요, macOS 기준
```

### 5. 실행
```bash
npm run dev
```
`http://localhost:3000`에서 확인. Firebase 설정이 안 되어 있으면 화면에 노란 배너로 알려줍니다.

## 알아두면 좋은 것

- 인증 없음 — 단일 데모 계정으로 동작 (`src/lib/demoUser.ts`)
- Firestore/Storage 규칙이 완전히 열려있음(`allow read, write: if true`) — 배포 전 반드시 잠글 것
- `/api/export-docx`(이력서 다운로드)는 서버에 LibreOffice가 있어야 동작 — Vercel 같은 서버리스 환경에는 배포 안 됨, 별도 서버 필요
- 각 페이지에 `process.env.NODE_ENV === "development"`일 때만 보이는 🧪 더미 데이터 버튼이 있음 — 에이전트 연동 전 테스트용, 프로덕션 빌드에는 안 보임
