# BloManagent

티스토리, 네이버 블로그, Blogger, WordPress 공개 블로그를 수집하고 비교 분석하는 워크스페이스입니다.

- Repository: https://github.com/sheryloe/BloManagent
- Landing page: https://sheryloe.github.io/BloManagent/
- Help / Manual: https://sheryloe.github.io/BloManagent/help.html
- Audience: 여러 블로그를 동시에 운영하며 로컬에서 분석을 축적하고 싶은 사용자

## Search Summary
공개 블로그 분석 워크스페이스

## Problem This Repo Solves
블로그 운영 데이터를 플랫폼별로 따로 관리하면 성장 추이, 주간 비교, AI 요약, 보조 지표 추적이 느리고 번거롭습니다.

## Key Features
- 메인 URL 기반 수집과 주간 비교 분석 흐름
- WordPress `wp-json`, RSS, sitemap, 공개 HTML 기반 수집
- OpenAI, Google AI Studio, Ollama를 선택할 수 있는 분석 구조
- 모노레포 기반 서버/웹/공유 패키지 구성
- 개인 또는 팀이 직접 실행하며 분석 이력을 축적하는 설계

## User Flow
- 블로그 메인 URL 등록
- 주간 단위 수집 및 분석 실행
- 대시보드에서 변화량과 AI 해석 비교
- 도움말 페이지에서 사용 예시와 안전 사용 기준 확인

## Tech Stack
- Node.js
- TypeScript
- npm workspaces
- Server/Web monorepo

## Quick Start
- `npm install` 후 `npm run dev`로 서버와 웹을 함께 실행합니다.
- 프로덕션 점검 시 `npm run build`와 `npm run start`를 사용합니다.
- 로컬 환경 변수는 `.env.example`을 기준으로 맞춥니다.

## Repository Structure
- `apps/`: 서버와 웹 애플리케이션
- `packages/`: 공용 로직
- `docs/`: 백테스트와 운영 문서

## Search Keywords
`blog analytics dashboard`, `tistory naver blogger wordpress analytics`, `블로그 분석 대시보드`, `공개 블로그 분석`

## FAQ
### BloManagent는 무엇을 분석하나요?
티스토리, 네이버 블로그, Blogger, WordPress 공개 블로그의 변화 추이와 게시물 흐름을 분석합니다.

### 어떤 방식으로 수집하나요?
공개 RSS, sitemap, WordPress `wp-json`, 본문 HTML을 순차 확인하는 방식으로 수집합니다.

### AI 제공자는 어떤 것을 쓰나요?
OpenAI, Google AI Studio, Ollama 같은 옵션을 고려한 구조입니다.
