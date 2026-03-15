export function HelpPage() {
  return (
    <div className="page">
      <section className="hero compact">
        <div>
          <p className="eyebrow">Manual</p>
          <h2>메인 URL로 수집하고 게시글별로 진단하는 방법</h2>
          <p className="muted">
            등록, 수집, 분석, 점수 해석, 정책 주의사항까지 한 페이지에서 확인할 수 있도록 정리했습니다.
          </p>
        </div>
      </section>

      <section className="grid two">
        <div className="panel">
          <div className="section-header">
            <h3>빠른 시작</h3>
          </div>
          <div className="stack-list">
            <article className="stack-item">
              <strong>1. 블로그 메인 URL 등록</strong>
              <p>예시: `https://storybeing.tistory.com`, `https://example.blogspot.com`, `https://wordpress.org/news/`</p>
            </article>
            <article className="stack-item">
              <strong>2. Discover 실행</strong>
              <p>RSS, sitemap, wp-json, 메인 링크를 차례대로 확인해 공개 게시글 URL을 수집합니다.</p>
            </article>
            <article className="stack-item">
              <strong>3. Analyze Now 실행</strong>
              <p>기본은 algorithm 엔진이며, 게시글마다 점수와 개선 제안을 계산합니다.</p>
            </article>
            <article className="stack-item">
              <strong>4. 대시보드와 상세 페이지 확인</strong>
              <p>낮은 점수 글, 반복 이슈, 다음 액션을 바로 확인합니다.</p>
            </article>
          </div>
        </div>

        <div className="panel">
          <div className="section-header">
            <h3>품질 점수란?</h3>
          </div>
          <div className="stack-list">
            <article className="stack-item">
              <strong>기존 내부 종합점수는 제거했습니다</strong>
              <p>설명이 어려운 내부 종합점수 대신, 게시글 단위의 `qualityScore(0~100)`를 대표 점수로 사용합니다.</p>
            </article>
            <article className="stack-item">
              <strong>점수 구성</strong>
              <p>제목/훅, 가독성, 정보 가치, 차별성, 검색 적합성 5개 항목 평균으로 계산합니다.</p>
            </article>
            <article className="stack-item">
              <strong>상태 구간</strong>
              <p>`80+ 우수`, `65~79 안정`, `50~64 주의`, `49 이하 보완 필요`로 표시합니다.</p>
            </article>
          </div>
        </div>
      </section>

      <section className="grid two">
        <div className="panel">
          <div className="section-header">
            <h3>왜 53개가 아니라 14개인가?</h3>
          </div>
          <div className="stack-list">
            <article className="stack-item">
              <strong>과거 티스토리 오탐 이슈</strong>
              <p>이전에는 메인 페이지의 `tag`, `archive`, `category` 링크까지 게시글로 잘못 세는 버그가 있었습니다.</p>
            </article>
            <article className="stack-item">
              <strong>현재는 비게시글 경로를 제외</strong>
              <p>티스토리는 숫자형 게시글 URL과 `/entry/`만 허용하도록 바꿨습니다.</p>
            </article>
            <article className="stack-item">
              <strong>storybeing.tistory.com 기준</strong>
              <p>현재 정상 집계는 `14개`이며, 소스별로 `rss 10 / sitemap 4 / main 0 / wp-json 0`입니다.</p>
            </article>
          </div>
        </div>

        <div className="panel">
          <div className="section-header">
            <h3>LLM 없이도 되나요?</h3>
          </div>
          <div className="stack-list">
            <article className="stack-item">
              <strong>기본은 알고리즘 분석</strong>
              <p>점수와 추천은 규칙 기반으로 계산하므로 API 키 없이도 수집, 분석, 대시보드 확인이 가능합니다.</p>
            </article>
            <article className="stack-item">
              <strong>AI는 선택형 보강</strong>
              <p>OpenAI, Google, Ollama는 요약 문장과 표현 보강 용도로만 선택할 수 있습니다. 점수는 AI를 켜도 바뀌지 않습니다.</p>
            </article>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="section-header">
          <h3>플랫폼별 주의사항</h3>
        </div>
        <div className="stack-list">
          <article className="stack-item">
            <strong>Tistory / Blogger / WordPress</strong>
            <p>공개 RSS, sitemap, wp-json, HTML 범위에서만 읽습니다.</p>
          </article>
          <article className="stack-item">
            <strong>Naver Blog</strong>
            <p>
              네이버는 자동 수집 관련 정책 리스크가 있어 기본값을 `비활성`로 둡니다. 설정에서 `allowNaverPublicCrawl`을 켠 뒤에만 수집/분석을 허용합니다.
            </p>
          </article>
          <article className="stack-item">
            <strong>공개 페이지만 대상</strong>
            <p>로그인, 비공개 글, 권한 우회가 필요한 영역은 수집하지 않습니다.</p>
          </article>
        </div>
      </section>
    </div>
  );
}
