# BloManagent

`BloManagent`는 공개 블로그의 메인 URL 또는 게시글 URL을 입력받아, 검증된 게시글만 기준으로 품질 점수와 개선 포인트를 보여주는 블로그 진단 서비스입니다.

- 저장소: `https://github.com/sheryloe/BloManagent`
- GitHub Pages: `https://sheryloe.github.io/BloManagent/`
- 도움말: `https://sheryloe.github.io/BloManagent/help.html`

## 서비스 개요

- 공개 블로그만 대상으로 수집합니다.
- 분석 점수는 고정된 알고리즘 기준으로 계산합니다.
- AI는 설명 문장 보강과 개선 제안 생성에만 활용합니다.
- 리포트를 서비스처럼 보고, 필요 시 초기화할 수 있는 워크스페이스를 지향합니다.

## 핵심 기능

- URL-only 공개 블로그 수집
- `tistory`, `wordpress`, `blogger`, `naver`, `generic` 계열 지원
- verified post만 집계하는 strict discovery
- `qualityScore` 기반 S~F 등급 환산
- Best/Worst, 분포, 반복 문제, 개선 액션 제안

## 플랫폼 수집 전략

- Tistory: RSS, sitemap, HTML
- WordPress: `wp-json`, RSS, sitemap, HTML
- Blogger: RSS/Atom, sitemap, HTML
- Naver Blog: opt-in 방식으로 제한 지원

## 실행 방법

```bash
npm install
npm run dev
```

기본 주소:

- Web: `http://localhost:5173`
- API: `http://localhost:8787`

## 디렉터리

- `apps/server`: 수집기와 분석 API
- `apps/web`: 리포트 UI
- `packages/shared`: 공용 타입/스키마
- `docs`: GitHub Pages 문서

## 다음 단계

- 분석 큐 기반 비동기 처리
- 리포트 공유 링크와 기간별 비교
- 스코어 근거를 더 세분화한 explainable report 강화
