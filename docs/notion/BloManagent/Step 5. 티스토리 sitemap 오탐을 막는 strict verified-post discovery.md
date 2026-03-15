# Step 5. 티스토리 sitemap 오탐을 막는 strict verified-post discovery

## SEO 패키지

- SEO 제목: 티스토리 sitemap 오탐을 막기 위해 strict verified-post discovery를 적용한 방법
- 슬러그: `tistory-strict-verified-post-discovery`
- 메타 설명: 티스토리 블로그에서 category, tag, archive URL이 게시글로 잘못 잡히는 문제를 어떻게 분석했고, verified와 excluded 상태로 어떻게 해결했는지 정리합니다.
- 핵심 키워드: 티스토리 sitemap 오탐, verified post discovery, 티스토리 글 수 불일치
- 보조 키워드: 티스토리 RSS 수집, category tag archive 제외, 게시글 검증 로직
- 추천 태그: `Tistory`, `sitemap`, `Crawler`, `Verification`, `Debugging`

## 도입

BloManagent를 실제 티스토리 블로그에 붙이자마자 가장 먼저 눈에 띈 문제는 글 수가 부풀어 보인다는 점이었습니다.
원인은 sitemap과 메인 링크 안에 실제 글 외의 URL이 섞여 있고, 잘못 저장된 URL이 다음 실행까지 남는 데 있었습니다.
그래서 Step 5에서는 “수집 후보”와 “검증된 게시글”을 명확히 분리하는 strict verified-post discovery 기준을 도입했습니다.

## 블로그 게시용 HTML 구조 예시

```html
<article>
  <header>
    <h1>티스토리 sitemap 오탐을 막기 위해 strict verified-post discovery를 적용한 방법</h1>
    <p>티스토리 false positive를 verified와 excluded 상태로 정리한 과정을 설명합니다.</p>
  </header>
  <section id="problem">
    <h2>왜 글 수가 부풀려졌는가</h2>
  </section>
  <section id="solution">
    <h2>strict verified-post discovery 설계</h2>
  </section>
  <section id="result">
    <h2>실제 검증 결과</h2>
  </section>
  <footer>다음 글 연결</footer>
</article>
```

## 티스토리에서는 왜 글 수가 틀어졌나

티스토리 공개 구조에는 실제 글 URL만 있는 것이 아닙니다. 아래 경로가 같이 섞일 수 있습니다.

- `/category/...`
- `/tag/...`
- `/archive/...`
- `/guestbook`
- `/notice`

초기 수집기는 공개 URL을 최대한 많이 잡는 데 초점이 있었기 때문에, 일부 경로가 글처럼 통과할 수 있었습니다.
이 false positive는 내부 저장소에 남아 `postCount`를 계속 부풀렸습니다.

## 해결 기준은 세 가지였다

이 문제를 고치면서 아래 기준을 먼저 고정했습니다.

### 1. postCount는 검증된 게시글 수여야 한다

사용자가 보는 `수집 글 수`는 반드시 실제 공개 게시글만 의미해야 합니다.

### 2. RSS와 sitemap을 main 링크보다 먼저 신뢰한다

메인 화면 링크는 UI 요소에 오염되기 쉽고, RSS와 sitemap은 더 안정적입니다.

### 3. 애매한 URL은 삭제보다 상태 분리가 안전하다

잘못된 URL은 이후 재검증과 디버깅을 위해 `excluded` 상태로 남깁니다.

## strict verified-post discovery는 어떻게 동작하나

최종 흐름은 아래처럼 바뀌었습니다.

1. RSS에서 후보 수집
2. sitemap에서 RSS에 없는 과거 글 보완
3. 둘 다 0건일 때만 main fallback
4. URL gate 적용
5. 실제 페이지 fetch
6. article marker 검증
7. verified 또는 excluded 반영

특히 URL gate를 강하게 두었습니다.

- 허용: `/{숫자}`, `/entry/...`
- 차단: `/category`, `/tag`, `/archive`, `/guestbook`, `/notice`, `/manage`, `/search`, `/toolbar`, `/pages`, `/media`

그리고 실제 페이지 안에서 `og:type=article`이나 `article:published_time` 같은 마커를 다시 확인합니다.

## verified와 excluded를 왜 저장했나

핵심은 필터링보다 상태 저장이었습니다.
`posts`에 `crawl_status`, `discovery_source`, `exclusion_reason`, `last_verified_at`, `excluded_at`를 둬서 최종 판정을 기록합니다.

이 상태는 내부적으로만 쓰고, UI에는 노출하지 않습니다. 사용자 화면에서는 `verified`만 보이게 했습니다.

- postCount 집계
- 블로그 상세 게시글 목록
- 분석 대상 선택
- 대시보드 카드 수치

이렇게 범위를 통일해야 사용자 화면과 내부 의미가 일치합니다.

## 실제 사례에서는 무엇이 달라졌나

`storybeing.tistory.com`을 다시 검증했을 때 결과는 아래처럼 정리됐습니다.

- verified total: `14`
- rss: `10`
- sitemap: `4`
- main: `0`
- wp-json: `0`

즉, category, tag, archive 같은 URL은 최종 집계에 들어가지 않습니다.

## 마무리

strict verified-post discovery는 “수집된 글”의 의미를 다시 정의한 설계 변경이었습니다.
오픈소스 분석 도구일수록 숫자 의미가 분명해야 합니다.

다음 글에서는 algorithm, OpenAI, Google, Ollama가 각각 어떤 역할을 맡고 있고, 어떤 부분을 신뢰해도 되고 어떤 부분은 보조 자료로 봐야 하는지 모델별 분석 신뢰도 기준으로 정리하겠습니다.

## 내부 링크 추천

- 이전 글: Step 4. 대시보드와 GitHub Pages 문서를 제품처럼 다듬는 과정
- 다음 글: Step 6. 모델별 분석 방법과 분석 신뢰도를 어떻게 분리했는가
