# BloManagent

> 메인 URL 하나만 넣으면 공개 블로그를 수집하고, 게시글별 `qualityScore`와 보완 포인트를 보여주는 로컬 중심 분석 워크스페이스입니다.

- Repository: https://github.com/sheryloe/BloManagent
- Landing page: https://sheryloe.github.io/BloManagent/
- Help / Manual: https://sheryloe.github.io/BloManagent/help.html

## What It Does

- `Tistory`, `Blogger`, `WordPress` 공개 블로그를 메인 URL 기준으로 수집합니다.
- `RSS -> sitemap -> wp-json -> main fallback` 순서로 공개 글을 찾습니다.
- 게시글마다 설명 가능한 `qualityScore(0-100)`와 개선 포인트를 계산합니다.
- 기본 분석 엔진은 `algorithm`이며, `OpenAI / Google / Ollama`는 선택형 문장 보강 용도로만 붙일 수 있습니다.
- 티스토리는 `strict verified-post discovery`를 적용해 검증된 공개 게시글만 `postCount`로 집계합니다.

## Why It Exists

기존 블로그 도구는 개별 글 생성이나 요약에는 강하지만, 실제 운영자가 궁금한 질문에는 잘 답하지 못하는 경우가 많았습니다.

- 지금 내 블로그에서 먼저 손봐야 할 글은 무엇인가
- 티스토리, 워드프레스, 블로그스팟을 같은 기준으로 볼 수 있는가
- API 키 없이도 공개 데이터만으로 기본 진단이 가능한가
- LLM이 없어도 안정적으로 점수와 개선 포인트를 만들 수 있는가

BloManagent는 이 질문에 맞춰 설계된 로컬 실행 중심 블로그 진단 도구입니다.

## qualityScore Model

대표 점수는 블로그 평균이 아니라 게시글 단위 `qualityScore`입니다.

- `headlineScore = avg(titleStrength, hookStrength)`
- `readabilityScore = structureScore`
- `valueScore = avg(informationDensityScore, practicalityScore)`
- `originalityScore = differentiationScore`
- `searchFitScore = avg(seoPotentialScore, audienceFitScore)`
- `qualityScore = round(avg(headlineScore, readabilityScore, valueScore, originalityScore, searchFitScore))`

상태 구간은 아래처럼 고정합니다.

- `80 이상`: excellent
- `65-79`: solid
- `50-64`: watch
- `49 이하`: needs-work

## Strict Tistory Counting

티스토리는 `검증된 전체 공개 게시글`만 수집 글 수로 집계합니다.

- 허용 URL: `/{숫자}`, `/entry/...`
- 제외 URL: `/category`, `/tag`, `/archive`, `/guestbook`, `/notice`, `/manage`, `/search`, `/toolbar`, `/pages`, `/media`
- `RSS`에서 먼저 검증된 글을 수집합니다.
- `sitemap.xml`은 RSS에 없는 과거 글만 보완합니다.
- `main` 링크는 RSS와 sitemap 결과가 모두 0건일 때만 fallback으로 사용합니다.

예시: `https://storybeing.tistory.com/`

- verified total: `14`
- `rss: 10`
- `sitemap: 4`
- `main: 0`
- `wp-json: 0`

## Platform Notes

- `Tistory`: 공개 RSS, sitemap, HTML만 사용합니다.
- `Blogger`: 공개 RSS/Atom, sitemap, HTML만 사용합니다.
- `WordPress`: 공개 `wp-json` REST API 우선, 없으면 RSS/sitemap/HTML로 폴백합니다.
- `Naver Blog`: 정책 리스크 때문에 기본값은 `allowNaverPublicCrawl=false` 입니다. opt-in을 직접 켜야 수집/분석이 가능합니다.

## Quick Start

```bash
npm install
npm run dev
```

Production build:

```bash
npm run build
npm run start
```

## Repository Structure

- `apps/server`: Fastify API, 수집기, 분석 오케스트레이션
- `apps/web`: React 대시보드
- `packages/shared`: 공용 타입과 Zod 스키마
- `docs`: GitHub Pages 랜딩/매뉴얼
- `docs/notion/BloManagent`: 노션/티스토리용 Step 1~5 원고

## Blog Series Drafts

티스토리 게시용 Step 문서는 아래 폴더에 정리되어 있습니다.

- `docs/notion/BloManagent/00. BloManagent 노션 페이지 구조.md`
- `docs/notion/BloManagent/Step 1. 메인 URL 기반 블로그 진단 도구를 기획한 이유.md`
- `docs/notion/BloManagent/Step 2. SQLite와 공개 피드 기반 블로그 수집기 설계.md`
- `docs/notion/BloManagent/Step 3. LLM 없이 qualityScore를 계산하는 설명 가능한 알고리즘.md`
- `docs/notion/BloManagent/Step 4. 대시보드와 GitHub Pages 문서를 제품처럼 다듬는 과정.md`
- `docs/notion/BloManagent/Step 5. 티스토리 sitemap 오탐을 막는 strict verified-post discovery.md`

노션 API로 하위 페이지를 자동 생성하려면, 대상 페이지를 integration에 공유한 뒤 아래 스크립트를 사용할 수 있습니다.

```bash
node scripts/publish-notion-series.mjs --token <NOTION_TOKEN> --parent <PARENT_PAGE_ID>
```

## Policy Notes

- 공개 페이지 범위 안에서만 요청합니다.
- 로그인 쿠키, 비공개 글, 관리자 통계는 수집하지 않습니다.
- 상용 SaaS보다 로컬 실행형 오픈소스 워크플로우에 초점을 둡니다.
