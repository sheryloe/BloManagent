# BloManagent | 로컬 퍼스트 블로그 분석 대시보드

**BloManagent**는 티스토리, 네이버 블로그, Blogger/Blogspot 같은 블로그의 메인 URL만 넣으면 글을 자동으로 수집하고, 주간 단위로 분석 이력을 쌓아 비교할 수 있게 만든 **로컬 퍼스트 블로그 분석 도구**입니다.  
공식 블로그 점수 API에 기대지 않고, 자체 점수인 **EBI(Estimated Blog Index)** 와 AI 분석을 조합해 블로그 운영 방향을 정리합니다.

## 왜 만들었나

블로그를 운영하다 보면 이런 문제가 반복됩니다.

- 내 블로그가 지난달보다 좋아졌는지 숫자로 보기 어렵다
- 티스토리, 네이버 블로그, Blogger를 각각 다른 방식으로 관리해야 한다
- 글 하나를 요약하는 도구는 많지만, 블로그 전체 방향성과 주간 변화 이력을 추적하는 도구는 드물다
- 매주 직접 확인하고 싶지만, 항상 켜두는 서버나 복잡한 클라우드 인프라는 부담스럽다

BloManagent는 이런 문제를 해결하려고 만들었습니다.

- **블로그 메인 URL 기반 자동 수집**
- **수동 실행 중심의 주간 분석**
- **히스토리 보존형 스냅샷 저장**
- **Google AI Studio / OpenAI / Ollama 선택형 분석**
- **Windows 로컬 실행 친화 구조**

## 이런 분에게 맞습니다

- 티스토리 블로그 분석 도구를 찾는 분
- 네이버 블로그 콘텐츠 품질을 주기적으로 점검하고 싶은 분
- Blogger/Blogspot 운영 현황을 수치와 히스토리로 보고 싶은 분
- 블로그 SEO, 제목 전략, 주제 분포, 콘텐츠 실용성을 함께 보고 싶은 분
- AI를 활용해 블로그 운영 대시보드를 직접 돌리고 싶은 분

## 핵심 기능

### 1. 블로그 등록과 플랫폼 자동 감지

- 블로그 이름과 메인 URL만 등록
- Blogger / Tistory / Naver Blog / Generic 사이트 감지
- RSS URL 수동 지정 가능

### 2. 메인 URL 기반 포스트 자동 수집

- RSS / Atom 우선 탐색
- sitemap 탐색
- 메인 페이지 링크 추출
- 플랫폼별 파서 적용
- 중복 URL 정규화와 dedupe 처리

### 3. 수동 실행형 분석 파이프라인

- `Analyze Now` 버튼으로 직접 실행
- 최신 7일 / 최신 30일 / 신규 글만 / 전체 리프레시 범위 선택
- 새 글과 변경된 글 기준 재수집
- 게시물 분석 -> 주간 요약 -> 추천 생성 순서로 저장

### 4. 히스토리 보존형 분석 저장

- 과거 분석 결과를 덮어쓰지 않음
- 포스트 분석 스냅샷 누적 저장
- 주간 리포트와 블로그 점수 히스토리 비교 가능

### 5. EBI(Estimated Blog Index) 점수

BloManagent는 외부 공식 점수가 아니라 내부 기준 점수인 **EBI** 를 계산합니다.

- 발행 일관성
- 주제 다양성
- 콘텐츠 구조
- 실용성
- SEO 잠재력
- 독자 적합성
- 최신성
- 참여 지표 스냅샷

## 지원 AI 제공자

- **Google AI Studio**: 기본 우선순위
- **OpenAI GPT API**: 보조 / fallback / 비교 분석
- **Ollama**: 로컬 LLM 실험 및 저비용 분석

## 기술 스택

- Frontend: React + Vite + React Router
- Backend: Fastify + TypeScript
- Database: SQLite + Drizzle ORM + better-sqlite3
- Crawling: HTTP fetch + Cheerio + Playwright fallback
- Validation: Zod
- Packaging friendly: 추후 Electron / Tauri 확장 가능

## 프로젝트 구조

```text
apps/
  server/   로컬 API, 수집기, 분석 러너, SQLite 처리
  web/      대시보드 UI
packages/
  shared/   공용 타입, Zod 스키마, EBI 계산 로직
docs/
  notion/   노션 업로드용 상세 구현 문서
```

## 빠른 시작

### 1. 설치

```bash
npm install
```

### 2. 환경 변수 준비

`.env.example`를 참고해 `.env` 파일을 구성합니다.

```env
GOOGLE_API_KEY=
OPENAI_API_KEY=
OLLAMA_BASE_URL=http://127.0.0.1:11434
APP_PORT=8787
WEB_PORT=5173
DATA_DIR=./data
```

### 3. 개발 모드 실행

```bash
npm run dev
```

- Web: `http://127.0.0.1:5173`
- API: `http://127.0.0.1:8787`

### 4. 프로덕션 빌드/실행

```bash
npm run build
npm run start
```

Windows에서는 아래 배치 파일도 사용할 수 있습니다.

```bat
start.bat
```

## 사용 방법

### Step 1. 블로그 등록

1. `블로그` 페이지로 이동
2. 블로그 이름 입력
3. 메인 URL 입력
4. 필요하면 RSS URL 입력
5. 저장

### Step 2. 포스트 수집

1. `Discover` 버튼 클릭
2. RSS / sitemap / 메인 링크 기준으로 포스트 탐색
3. 새 글과 변경 글이 SQLite DB에 저장

### Step 3. 수동 분석 실행

1. `Analyze Now` 클릭
2. 분석 범위 선택
3. 제공자/모델 설정 확인
4. 런 로그 페이지에서 진행 상황 확인

### Step 4. 대시보드 확인

- 블로그별 최신 EBI
- 직전 대비 점수 변화
- 최신 추천
- 주간 리포트
- 블로그 상세 페이지의 포스트 목록과 점수 이력

## 설정 화면에서 할 수 있는 것

- 제공자별 모델 지정
- 기본 제공자 설정
- 최대 포스트 수 제한
- 예산 한도 설정
- Google / OpenAI API Key 저장
- Ollama Base URL 저장

## 데이터 저장 방식

BloManagent는 로컬 퍼스트 구조를 따릅니다.

- SQLite DB에 블로그, 포스트, 분석 이력 저장
- OS Keychain 우선으로 API Key 저장
- 실패 시 환경 변수 fallback 사용
- 과거 분석 결과는 덮어쓰지 않고 스냅샷 누적

## 현재 구현 범위

현재 버전은 **Phase 1** 기준 구현입니다.

- 블로그 등록 / 삭제
- 플랫폼 감지
- 포스트 수집
- 수동 분석 런
- 분석 로그
- 주간 리포트 조회
- 설정 화면

## 앞으로 확장할 기능

- 비교 기간 선택형 상세 리포트
- 주제 분석 전용 화면
- 더 강한 티스토리/네이버 파서
- Electron / Tauri 패키징
- 더 정교한 비용 제어

## 테스트

```bash
npm test
```

## SEO 관점에서 이 프로젝트가 다루는 주제

이 저장소는 아래 검색 의도에 맞춰 설계되었습니다.

- 티스토리 블로그 분석 도구
- 네이버 블로그 분석 대시보드
- 블로그 SEO 관리 툴
- 블로그 운영 리포트 자동화
- 로컬 AI 블로그 분석 프로그램

README도 Google 검색과 GitHub 검색에서 주제를 더 명확하게 전달할 수 있도록, 프로젝트명과 핵심 키워드를 자연스럽게 포함해 구성했습니다.

## 라이선스

개인/팀 상황에 맞게 추가하세요. 현재는 별도 라이선스를 명시하지 않았습니다.
