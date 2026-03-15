export function HelpPage() {
  return (
    <div className="page">
      <section className="hero compact">
        <div>
          <p className="eyebrow">Manual</p>
          <h2>메인 URL만으로 시작하는 사용 가이드</h2>
          <p className="muted">
            블로그 등록, 공개 페이지 수집, 분석 실행, 안전하게 사용하는 기준까지 한 번에 볼 수 있도록 정리했습니다.
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
              <p>예시: `https://storybeing.tistory.com`, `https://blog.naver.com/naverofficial`, `https://sample.blogspot.com`</p>
            </article>
            <article className="stack-item">
              <strong>2. Discover 실행</strong>
              <p>RSS, sitemap, wp-json, 메인 페이지 링크 순서로 공개 포스트를 찾고 중복은 정리합니다.</p>
            </article>
            <article className="stack-item">
              <strong>3. Analyze Now 실행</strong>
              <p>최근 글 범위를 선택해 분석을 돌리면 대시보드와 상세 페이지에 점수와 보완 포인트가 쌓입니다.</p>
            </article>
            <article className="stack-item">
              <strong>4. 대시보드와 리포트 확인</strong>
              <p>블로그별 EBI, 최근 추천 액션, 최근 실행 기록을 함께 보면서 우선순위를 정합니다.</p>
            </article>
          </div>
        </div>

        <div className="panel">
          <div className="section-header">
            <h3>지원 URL 예시</h3>
          </div>
          <div className="stack-list">
            <article className="stack-item">
              <strong>티스토리</strong>
              <p>`https://example.tistory.com`</p>
            </article>
            <article className="stack-item">
              <strong>네이버 블로그</strong>
              <p>`https://blog.naver.com/example` 또는 블로그 홈 URL</p>
            </article>
            <article className="stack-item">
              <strong>Blogger / Blogspot</strong>
              <p>`https://example.blogspot.com`</p>
            </article>
            <article className="stack-item">
              <strong>WordPress</strong>
              <p>`https://example.com` 또는 `https://wordpress.org/news/` 같은 공개 블로그 메인 URL</p>
            </article>
          </div>
        </div>
      </section>

      <section className="grid two">
        <div className="panel">
          <div className="section-header">
            <h3>수집 방식</h3>
          </div>
          <div className="stack-list">
            <article className="stack-item">
              <strong>RSS / Atom 우선</strong>
              <p>가장 안정적인 공개 피드를 먼저 읽습니다. 네이버 블로그는 blogId를 해석해 RSS를 먼저 시도합니다.</p>
            </article>
            <article className="stack-item">
              <strong>sitemap 보조 수집</strong>
              <p>RSS보다 더 많은 글을 담는 경우가 많아서 누락 보완용으로 함께 확인합니다.</p>
            </article>
            <article className="stack-item">
              <strong>WordPress는 wp-json 우선</strong>
              <p>공개 REST API가 있으면 페이지네이션으로 모든 공개 포스트를 가져오고, 없으면 RSS와 sitemap으로 돌아갑니다.</p>
            </article>
            <article className="stack-item">
              <strong>메인 페이지 링크는 마지막 fallback</strong>
              <p>RSS나 sitemap이 부족할 때만 추가로 확인합니다. 공개 링크만 수집하고 비공개 영역은 다루지 않습니다.</p>
            </article>
          </div>
        </div>

        <div className="panel">
          <div className="section-header">
            <h3>분석 결과 읽는 법</h3>
          </div>
          <div className="stack-list">
            <article className="stack-item">
              <strong>EBI</strong>
              <p>제목, 구조, 실용성, 차별성, SEO 가능성, 독자 적합도 등을 종합한 내부 지표입니다.</p>
            </article>
            <article className="stack-item">
              <strong>최근 추천 액션</strong>
              <p>분석 결과에서 지금 가장 먼저 손봐야 할 작업만 짧게 보여 줍니다.</p>
            </article>
            <article className="stack-item">
              <strong>최근 실행 기록</strong>
              <p>어떤 모델로 몇 개 포스트를 분석했고 비용이 어느 정도였는지 확인할 수 있습니다.</p>
            </article>
            <article className="stack-item">
              <strong>글별 보완 포인트</strong>
              <p>상세 페이지와 리포트에서 요약, 강점, 약점, 개선 항목을 보고 다음 글 기획에 반영합니다.</p>
            </article>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="section-header">
          <h3>안전하게 사용하는 기준</h3>
        </div>
        <div className="stack-list">
          <article className="stack-item">
            <strong>공개 페이지 기준으로만 사용</strong>
            <p>로그인이 필요한 페이지, 비공개 글, 접근 제한을 우회해야 하는 영역은 수집 대상에서 제외합니다.</p>
          </article>
          <article className="stack-item">
            <strong>서비스 약관과 robots.txt 확인</strong>
            <p>공개 페이지라도 자동 접근 정책은 서비스마다 다를 수 있으니, 오픈소스 배포나 호스팅 전에 해당 서비스 정책과 robots.txt를 확인하는 쪽이 안전합니다.</p>
          </article>
          <article className="stack-item">
            <strong>네이버 블로그는 특히 보수적으로 판단</strong>
            <p>
              네이버 서비스 이용약관에는 사전 허락 없이 자동화된 수단으로 네이버 서비스에 게재된 회원의 ID나
              게시물 등을 수집하는 행위를 금지하는 문구가 있습니다. 공개 RSS가 존재하더라도 실제 사용 전
              정책을 다시 확인하는 쪽이 안전합니다.
            </p>
          </article>
          <article className="stack-item">
            <strong>원문 재배포보다 분석 결과 중심</strong>
            <p>원문 전체를 외부에 다시 공개하기보다, 내부 분석 메모와 개선 포인트 중심으로 사용하는 것이 안전합니다.</p>
          </article>
          <article className="stack-item">
            <strong>이 프로젝트의 기본 전제</strong>
            <p>BloManagent는 공개 URL 기준의 개인/팀용 분석 도구로 설계했고, 인증 우회나 비공개 데이터 접근은 목표에 넣지 않았습니다.</p>
          </article>
        </div>
      </section>

      <section className="panel">
        <div className="section-header">
          <h3>자주 묻는 질문</h3>
        </div>
        <div className="stack-list">
          <article className="stack-item">
            <strong>RSS가 없으면 등록이 안 되나요?</strong>
            <p>아닙니다. RSS URL은 고급 옵션일 뿐이고, 없으면 sitemap과 메인 페이지를 추가로 탐색합니다.</p>
          </article>
          <article className="stack-item">
            <strong>좋아요나 댓글 수가 안 보일 수 있나요?</strong>
            <p>네. 공개 페이지에 드러나는 값만 읽기 때문에 스킨 구조나 플랫폼 정책에 따라 비어 있을 수 있습니다.</p>
          </article>
          <article className="stack-item">
            <strong>GitHub Pages 문서도 있나요?</strong>
            <p>
              있습니다. 저장소 문서 페이지는{" "}
              <a href="https://sheryloe.github.io/BloManagent/" rel="noreferrer" target="_blank">
                GitHub Pages
              </a>
              에서 확인할 수 있습니다.
            </p>
          </article>
        </div>
      </section>
    </div>
  );
}
