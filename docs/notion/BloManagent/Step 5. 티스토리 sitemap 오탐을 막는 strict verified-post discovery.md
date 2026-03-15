# Step 5. 티스토리 sitemap 오탐을 막는 strict verified-post discovery

## SEO 패키지

- SEO 제목: 티스토리 sitemap 오탐을 막기 위해 strict verified-post discovery를 적용한 방법
- 슬러그: `tistory-strict-verified-post-discovery`
- 메타 설명: 티스토리 블로그에서 category, tag, archive URL이 게시글로 잘못 집계되는 문제를 어떻게 분석했고, verified/excluded 상태를 도입해 해결했는지 정리합니다.
- 핵심 키워드: 티스토리 sitemap 오탐, verified post discovery, 티스토리 글 수 불일치
- 보조 키워드: 티스토리 RSS 수집, category tag archive 제외, 블로그 크롤러 검증 로직
- 추천 태그: `Tistory`, `sitemap`, `crawler`, `verification`, `디버깅`

## 도입

BloManagent를 실제 티스토리 블로그에 붙여보면서 생각보다 큰 문제가 하나 드러났습니다.

“내가 보기에는 글이 12개쯤인데, 왜 수집 결과는 56개처럼 보이지?”

이 문제는 단순 버그가 아니라, 티스토리 공개 구조를 어떻게 해석할지에 관한 설계 문제였습니다.  
그리고 이 문제를 해결하면서 `strict verified-post discovery`라는 기준이 생겼습니다.

## 이 글에서 다루는 내용

1. 왜 티스토리에서 글 수가 부풀려졌는가
2. RSS, sitemap, main 링크를 어떻게 다시 해석했는가
3. verified / excluded 상태를 왜 도입했는가
4. 실제 사례에서 결과가 어떻게 달라졌는가

## 문제는 어디서 시작됐나

티스토리의 sitemap과 메인 링크에는 실제 글 외에도 아래 경로가 섞일 수 있습니다.

- `/category/...`
- `/tag/...`
- `/archive/...`
- `/guestbook`
- `/notice`

초기에는 이 URL들 중 일부가 글처럼 통과할 수 있었습니다.  
메인 링크 fallback 규칙이 넓었고, 기존에 잘못 저장된 URL도 DB에 남아 있었기 때문입니다.

즉, 사용자가 보는 “최근 글 개수”와 도구가 잡는 “저장된 posts row 수”가 서로 다른 문제가 생겼습니다.

## 해결 원칙을 다시 세웠다

이 문제를 고치기 위해 아래 원칙을 먼저 고정했습니다.

### 원칙 1. postCount는 검증된 공개 게시글만 의미해야 한다

글처럼 보인다고 post가 되어서는 안 됩니다.  
실제 article 페이지인지 확인된 URL만 집계해야 합니다.

### 원칙 2. main 링크는 최후 fallback으로만 써야 한다

RSS와 sitemap이 있는데도 main 링크를 적극적으로 쓰면 오탐 확률이 높아집니다.

### 원칙 3. 잘못된 URL은 삭제보다 상태 분리가 낫다

처음에는 false positive row를 지워버릴 수도 있었습니다.  
하지만 나중에 다시 검증될 가능성과 디버깅 기록을 생각하면, `excluded` 상태로 남기는 편이 더 안전했습니다.

## strict verified-post discovery는 어떻게 동작하나

최종 discovery 흐름은 아래처럼 바뀌었습니다.

1. candidate 수집
2. URL 규칙 필터
3. 실제 페이지 fetch
4. article marker 검증
5. verified / excluded 반영

### URL gate

허용 경로:

- `/{숫자}`
- `/entry/...`

차단 경로:

- `/category`
- `/tag`
- `/archive`
- `/guestbook`
- `/notice`
- `/manage`
- `/search`
- `/toolbar`
- `/pages`
- `/media`

### source order

- RSS 먼저
- sitemap은 RSS에 없는 과거 글 보완
- main 링크는 RSS와 sitemap이 모두 0건일 때만 fallback

### page gate

실제 페이지를 가져온 뒤 `og:type=article`, `article:published_time` 같은 마커를 확인합니다.  
마커가 없으면 글이 아닌 것으로 보고 제외합니다.

## verified / excluded 상태는 왜 중요했나

이번 수정에서 핵심은 단순 필터링이 아니었습니다.  
`posts` 자체에 검증 상태를 저장하도록 바꾼 것이 더 중요했습니다.

- `verified`: 실제 공개 게시글로 확인된 URL
- `excluded`: 후보였지만 글로 검증되지 않은 URL

그리고 excluded row는 UI에 직접 노출하지 않습니다.

- `postCount`에서 제외
- 블로그 상세 posts 목록에서 제외
- 분석 대상 선택에서 제외
- 대시보드 집계에서 제외

즉, 내부 기록은 남기되 사용자 화면은 깨끗하게 유지하는 방식입니다.

## 실제 사례: storybeing.tistory.com

이 수정 전에는 메인 링크와 잘못 저장된 URL 때문에 글 수가 부풀어 보일 수 있었습니다.  
수정 후 `storybeing.tistory.com`을 다시 검증한 결과는 아래처럼 정리됐습니다.

- verified total: `14`
- rss: `10`
- sitemap: `4`
- main: `0`
- wp-json: `0`

이제는 category, tag, archive 같은 URL이 있더라도 postCount에 들어가지 않습니다.

## 이 수정이 주는 효과

strict verified-post discovery를 넣고 나서 좋아진 점은 분명했습니다.

- 사용자가 보는 글 수와 내부 집계 의미가 일치한다
- 티스토리 false positive가 분석 결과를 오염시키지 않는다
- 기존 잘못 저장된 row도 재수집 과정에서 excluded로 재분류된다
- 대시보드와 상세 화면이 더 신뢰할 수 있게 된다

결국 이 수정은 단순 버그픽스가 아니라, “수집 글 수란 무엇인가”를 명확하게 다시 정의한 작업이었습니다.

## 마무리

프로젝트를 만들다 보면 기능 추가보다 기준을 다시 세우는 수정이 더 중요할 때가 있습니다.  
티스토리 strict verified-post discovery가 그랬습니다.

이제 BloManagent는 메인 URL 하나로 시작하더라도, 최소한 “이 숫자가 무엇을 뜻하는가”에 대해서는 훨씬 더 분명하게 말할 수 있게 됐습니다.

시리즈 전체를 마무리하면서 느낀 점은 단순합니다.  
오픈소스 도구라고 해서 기능만 있으면 되는 것이 아니라, 사용자에게 신뢰할 수 있는 집계와 이해 가능한 근거를 주는 설계가 더 중요하다는 것입니다.

## 내부 링크 추천

- 이전 글: Step 4. 대시보드와 GitHub Pages 문서를 제품처럼 다듬는 과정
- 시리즈 허브: BloManagent 노션 페이지 구조
