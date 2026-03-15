# BloManagent

공개 블로그 메인 URL을 넣고 게시글별 `qualityScore`와 보완 포인트를 확인하는 로컬 중심 오픈소스 워크스페이스입니다.

- Repository: https://github.com/sheryloe/BloManagent
- Landing page: https://sheryloe.github.io/BloManagent/
- Help / Manual: https://sheryloe.github.io/BloManagent/help.html

## What It Does

- Tistory, Blogger, WordPress 공개 블로그를 메인 URL 기준으로 수집합니다.
- RSS, sitemap, WordPress `wp-json`, 메인 링크를 차례대로 확인합니다.
- 게시글마다 설명 가능한 `qualityScore(0-100)`와 개선 제안을 계산합니다.
- 기본 분석 엔진은 `algorithm`이며, OpenAI / Google / Ollama는 선택형 보강 기능으로만 사용합니다.

## Why The Score Changed

기존 내부 종합지표는 설명 가능성이 약했습니다. 지금은 게시글 단위의 `qualityScore`를 대표 점수로 사용하고, 다음 5개 항목을 함께 보여줍니다.

- 제목/훅
- 가독성
- 정보 가치
- 차별성
- 검색 적합성

## Storybeing Tistory Example

`https://storybeing.tistory.com/` 기준으로 과거의 `53개 수집`은 티스토리 메인 링크 오탐 버그였습니다.

현재 정상 집계는 아래와 같습니다.

- total: 14
- rss: 10
- sitemap: 4
- main: 0
- wp-json: 0

## Policy Notes

- 공개 페이지만 읽습니다.
- 로그인, 비공개 글, 권한 우회가 필요한 영역은 수집하지 않습니다.
- 네이버 블로그는 정책 리스크 때문에 기본 비활성 상태이며, `allowNaverPublicCrawl`을 직접 켜야 수집/분석할 수 있습니다.

## Quick Start

```bash
npm install
npm run dev
```

빌드와 실행:

```bash
npm run build
npm run start
```
