export function HelpPage() {
  return (
    <div className="page">
      <section className="hero dashboard-hero">
        <div>
          <p className="eyebrow">Manual</p>
          <h2>처음 보는 사람도 바로 따라 할 수 있는 BloManagent 사용 안내</h2>
          <p className="muted">
            등록, 수집, 분석, 등급 해석, 플랫폼별 주의사항까지 한 페이지에서 빠르게 확인할 수 있도록 정리했습니다.
          </p>
        </div>

        <div className="hero-stats dashboard-stats">
          <div className="metric-card">
            <span>입력 방식</span>
            <strong>URL Only</strong>
          </div>
          <div className="metric-card">
            <span>기본 분석</span>
            <strong>Algorithm</strong>
          </div>
          <div className="metric-card">
            <span>화면 표기</span>
            <strong>S ~ F</strong>
          </div>
          <div className="metric-card">
            <span>워크스페이스</span>
            <strong>초기화 가능</strong>
          </div>
        </div>
      </section>

      <section className="grid two">
        <div className="panel">
          <div className="section-header">
            <h3>빠른 시작</h3>
          </div>
          <div className="stack-list">
            <article className="stack-item">
              <strong>1. 블로그 주소 또는 게시글 주소 입력</strong>
              <p>예시: `https://storybeing.tistory.com`, `https://storybeing.tistory.com/18`, `https://wordpress.org/news/`</p>
            </article>
            <article className="stack-item">
              <strong>2. 자동 수집</strong>
              <p>RSS, sitemap, wp-json, 메인 링크를 순서대로 확인해서 공개 게시글 URL만 모읍니다.</p>
            </article>
            <article className="stack-item">
              <strong>3. 분석 시작</strong>
              <p>algorithm 엔진이 게시글마다 등급과 개선 제안을 계산합니다.</p>
            </article>
            <article className="stack-item">
              <strong>4. 리포트 확인</strong>
              <p>베스트 글, 워스트 글, 분포, 반복 병목, 다음 액션을 바로 볼 수 있습니다.</p>
            </article>
          </div>
        </div>

        <div className="panel">
          <div className="section-header">
            <h3>등급 체계</h3>
          </div>
          <div className="stack-list">
            <article className="stack-item">
              <strong>화면은 S부터 F까지 등급 중심</strong>
              <p>내부 계산은 qualityScore로 유지하지만, 화면과 리포트는 등급 중심으로 보여줍니다.</p>
            </article>
            <article className="stack-item">
              <strong>다섯 축으로 계산</strong>
              <p>제목·첫인상, 가독성, 정보 가치, 차별성, 검색 적합성을 종합해서 최종 등급을 만듭니다.</p>
            </article>
            <article className="stack-item">
              <strong>등급 구간</strong>
              <p>`S 90+`, `A 80+`, `B 65+`, `C 55+`, `D 45+`, `F 45 미만` 기준으로 표시합니다.</p>
            </article>
          </div>
        </div>
      </section>

      <section className="grid two">
        <div className="panel">
          <div className="section-header">
            <h3>티스토리 글 수가 왜 달라질 수 있나</h3>
          </div>
          <div className="stack-list">
            <article className="stack-item">
              <strong>과거에는 메인 링크 오탐 문제가 있었습니다.</strong>
              <p>`tag`, `archive`, `category` 같은 페이지가 글처럼 들어가면서 수집 수가 부풀어 오를 수 있었습니다.</p>
            </article>
            <article className="stack-item">
              <strong>지금은 검증된 공개 게시글만 셉니다.</strong>
              <p>숫자형 글 URL과 `/entry/`만 허용하고, 실제 article marker가 없으면 제외합니다.</p>
            </article>
            <article className="stack-item">
              <strong>storybeing.tistory.com 기준</strong>
              <p>현재 정상 집계는 `14개`이고, 소스별로 `rss 10 / sitemap 4 / main 0 / wp-json 0`입니다.</p>
            </article>
          </div>
        </div>

        <div className="panel">
          <div className="section-header">
            <h3>AI 없이도 되나</h3>
          </div>
          <div className="stack-list">
            <article className="stack-item">
              <strong>기본은 알고리즘 분석</strong>
              <p>API 키가 없어도 수집, 진단, 리포트, 대시보드까지 전부 사용할 수 있습니다.</p>
            </article>
            <article className="stack-item">
              <strong>AI는 문장 보강 용도</strong>
              <p>OpenAI, Google, Ollama는 요약 문장과 설명을 다듬는 보조 엔진으로만 동작합니다.</p>
            </article>
            <article className="stack-item">
              <strong>등급은 AI가 바꾸지 않습니다.</strong>
              <p>AI를 켜도 S~F 등급과 내부 점수는 algorithm 결과를 그대로 유지합니다.</p>
            </article>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="section-header">
          <h3>플랫폼 및 정책 주의사항</h3>
        </div>
        <div className="stack-list">
          <article className="stack-item">
            <strong>Tistory / Blogger / WordPress</strong>
            <p>공개 RSS, sitemap, wp-json, HTML 범위만 읽습니다. 로그인 정보와 비공개 데이터는 사용하지 않습니다.</p>
          </article>
          <article className="stack-item">
            <strong>Naver Blog</strong>
            <p>정책 리스크가 있어 기본값은 `allowNaverPublicCrawl=false` 입니다. 사용자가 직접 opt-in 했을 때만 수집합니다.</p>
          </article>
          <article className="stack-item">
            <strong>공개 페이지 기준</strong>
            <p>비공개 글, 로그인 필요 영역, 쿠키가 필요한 영역은 수집하지 않습니다.</p>
          </article>
        </div>
      </section>
    </div>
  );
}
