import { NavLink, Outlet, useLocation } from "react-router-dom";

const links = [
  { to: "/", label: "개요 보드" },
  { to: "/blogs", label: "수집 작업대" },
  { to: "/reports", label: "리포트 센터" },
  { to: "/settings", label: "엔진 설정" },
  { to: "/logs", label: "실행 로그" },
  { to: "/help", label: "사용 안내" },
];

const pageMeta = [
  {
    match: (pathname: string) => pathname === "/",
    title: "전체 운영 개요",
    description: "블로그 전체 상태, 위험 게시글, 반복 이슈, 즉시 실행할 우선순위를 한 화면에서 보는 메인 분석 보드입니다.",
  },
  {
    match: (pathname: string) => pathname.startsWith("/blogs/"),
    title: "블로그 상세 진단",
    description: "개별 게시글의 등급, 신호 분해, 약점, 개선 우선순위를 보고서처럼 확인하는 상세 화면입니다.",
  },
  {
    match: (pathname: string) => pathname === "/blogs",
    title: "수집 작업대",
    description: "블로그 주소나 게시글 주소를 넣고 수집, 분석, 초기화를 바로 수행하는 휘발성 워크스페이스입니다.",
  },
  {
    match: (pathname: string) => pathname === "/reports",
    title: "리포트 센터",
    description: "최신 분석 기준으로 베스트·워스트 게시글, 분포, 병목, 실행 로그를 관제 화면처럼 확인합니다.",
  },
  {
    match: (pathname: string) => pathname === "/settings",
    title: "엔진 설정",
    description: "기본 알고리즘 분석과 선택형 AI 보강 엔진을 현재 환경에 맞게 조정하는 설정 화면입니다.",
  },
  {
    match: (pathname: string) => pathname === "/logs",
    title: "실행 추적 로그",
    description: "수집과 분석이 어떤 순서로 진행됐는지, 어디에서 실패했는지, 지금 어떤 상태인지 추적하는 화면입니다.",
  },
  {
    match: (pathname: string) => pathname === "/help",
    title: "사용 안내",
    description: "사용 방법, 등급 체계, 티스토리 검증 규칙, 정책상 주의사항을 빠르게 확인하는 안내 페이지입니다.",
  },
];

export function AppLayout() {
  const location = useLocation();
  const current = pageMeta.find((item) => item.match(location.pathname)) ?? pageMeta[0];

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="sidebar-brand">
          <div className="brand-badge">BM</div>
          <div>
            <p className="sidebar-kicker">Navy Analysis Desk</p>
            <h1>BloManagent</h1>
            <p className="sidebar-copy">
              공개 블로그 글을 수집하고 게시글별 등급과 개선 포인트를 보여주는 분석형 워크스페이스입니다.
            </p>
          </div>
        </div>

        <div className="sidebar-section">
          <p className="sidebar-section-label">Workboard</p>
          <nav className="sidebar-nav">
            {links.map((link) => (
              <NavLink
                key={link.to}
                className={({ isActive }) => (isActive ? "sidebar-link sidebar-link-active" : "sidebar-link")}
                end={link.to === "/"}
                to={link.to}
              >
                <span>{link.label}</span>
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="sidebar-section sidebar-note">
          <p className="sidebar-section-label">Operating Rules</p>
          <div className="note-grid">
            <article>
              <strong>공개 데이터만</strong>
              <p>로그인 영역, 비공개 글, 관리자 통계는 읽지 않습니다.</p>
            </article>
            <article>
              <strong>언제든 초기화</strong>
              <p>필요할 때만 수집하고 끝나면 워크스페이스를 비울 수 있습니다.</p>
            </article>
            <article>
              <strong>S부터 F까지</strong>
              <p>화면은 등급 중심으로 보여주고 내부 계산은 알고리즘이 맡습니다.</p>
            </article>
          </div>
        </div>
      </aside>

      <main className="app-main">
        <header className="app-header">
          <div>
            <p className="page-kicker">Analysis Console</p>
            <h2>{current.title}</h2>
            <p className="page-description">{current.description}</p>
          </div>

          <div className="header-pills">
            <span className="header-pill">Public Data</span>
            <span className="header-pill">Grade Report</span>
            <span className="header-pill">Resettable Workspace</span>
          </div>
        </header>

        <section className="app-content">
          <Outlet />
        </section>
      </main>
    </div>
  );
}
