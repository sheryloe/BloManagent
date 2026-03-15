# BloManagent

공개 블로그를 메인 URL 또는 게시글 URL 기준으로 수집하고, 게시글별 등급과 개선 포인트를 보여주는 휘발성 분석 워크스페이스입니다.

![BloManagent 대시보드](docs/assets/screenshots/blomanagent-cover.png)

## Snapshot

- 저장소: `https://github.com/sheryloe/BloManagent`
- GitHub Pages: `https://sheryloe.github.io/BloManagent/`
- 사용 안내: `https://sheryloe.github.io/BloManagent/help.html`
- wiki: `https://github.com/sheryloe/BloManagent/wiki`

## DO

- URL-only public ingestion 구현
  - 블로그 메인 주소와 게시글 주소 모두 입력 가능
  - `tistory`, `wordpress`, `blogger`, `naver`, `generic` 판별
  - WordPress `wp-json` 우선 수집
- strict verified-post discovery 적용
  - `postCount`는 `verified post`만 집계
  - 티스토리 `category`, `tag`, `archive`, `guestbook` 오탐 제거
- algorithm-first 분석 구조 정착
  - `qualityScore` 기반 계산
  - 화면은 `S ~ F` 등급 중심
  - `openai`, `google`, `ollama`는 서술 보강 전용
- Algorithm V2 적용
  - 제목, 훅, 문단, 소제목, 목록, FAQ, 숫자 토큰, 형제 글 중복 반영
  - 신호별 근거 추출
  - 근거 기반 개선 작업 생성
- UI 재정리
  - 네이비 BI 리포트 톤
  - packed layout
  - Best / Worst / 분포 / 반복 병목 보드
  - 분석 상태 표시와 초기화 버튼

## TODO

- 네이버 정책 리스크 안내 강화
- 댓글 / 공감 / 조회수 선택자 품질 보강
- 리포트 export와 분포 시각화 확장
- Tauri 또는 Electron 패키징 검토
- 문서 / wiki / 노션 자동 동기화 스크립트 정리

## WillDO

- Step 7 이후 문서 시리즈 확장
- 로컬 앱 배포 흐름 정리
- score calibration 반복
- 모델별 프롬프트 / 보강 문체 비교표 정리

## Product Rules

- 워크스페이스는 휘발성입니다.
- 점수와 등급은 항상 `algorithm`이 계산합니다.
- AI 엔진은 설명 문장 보강만 담당합니다.
- 공개 페이지 범위만 수집합니다.
- 로그인 필요 영역과 비공개 글은 다루지 않습니다.
- 네이버 공개 수집은 기본 비활성 상태입니다.

## Platform Matrix

| 플랫폼 | 수집 방식 | 기본 정책 | 비고 |
| --- | --- | --- | --- |
| Tistory | RSS, sitemap, HTML | 기본 지원 | strict verified-post 적용 |
| WordPress | wp-json, RSS, sitemap, HTML | 기본 지원 | 공개 REST API 우선 |
| Blogger | RSS/Atom, sitemap, HTML | 기본 지원 | 공개 피드 중심 |
| Naver Blog | opt-in 필요 | 기본 비활성 | 정책 리스크 보수 대응 |

## Scoring Model

BloManagent는 내부적으로 `qualityScore`를 계산한 뒤 화면에는 `S ~ F` 등급으로 변환합니다.

- `headlineScore`: 제목과 첫인상
- `readabilityScore`: 가독성
- `valueScore`: 정보 가치
- `originalityScore`: 차별성
- `searchFitScore`: 검색 적합성

등급 컷:

- `S`: 90+
- `A`: 80+
- `B`: 65+
- `C`: 55+
- `D`: 45+
- `F`: 45 미만

## What The UI Shows

- 개요 보드
  - 블로그 상태, 분포, 병목, 최신 추천
- 수집 작업대
  - 주소 입력, 수집, 분석, 초기화
- 리포트 센터
  - 평균 등급, 분포, Best/Worst, 실행 로그
- 블로그 상세
  - 신호별 근거
  - 왜 낮은지 수치와 증거
  - 글 내용 기반 개선 작업

## Local Run

```bash
npm install
npm run dev
```

기본 접속 주소:

- 웹: `http://localhost:5173`
- API: `http://localhost:8787`

배포용 빌드:

```bash
npm run build
npm run start
```

## Project Structure

- [`apps/server`](apps/server): Fastify API, 수집기, 분석 서비스
- [`apps/web`](apps/web): React 기반 대시보드
- [`packages/shared`](packages/shared): 공용 스키마와 타입
- [`docs`](docs): GitHub Pages 문서
- [`docs/notion/BloManagent`](docs/notion/BloManagent): 블로그 / 노션용 원고
- [`명세서.md`](명세서.md): 다음 세션 복구용 명세

## Documentation Flow

- 저장소 운영 기준: [`명세서.md`](명세서.md)
- 외부 공유 기준: GitHub wiki
- 블로그용 Step 원고: `docs/notion/BloManagent`
- 노션 발행 스크립트: `scripts/publish-notion-docs.cjs`

다음 세션에서는 `명세서.md`부터 읽는 것을 기준으로 합니다.
