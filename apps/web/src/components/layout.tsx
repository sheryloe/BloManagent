import { NavLink, Outlet } from "react-router-dom";

const links = [
  { to: "/", label: "대시보드" },
  { to: "/blogs", label: "블로그" },
  { to: "/reports", label: "리포트" },
  { to: "/help", label: "도움말" },
  { to: "/settings", label: "설정" },
  { to: "/logs", label: "실행 로그" },
];

export function AppLayout() {
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <p className="eyebrow">BloManagent</p>
          <h1>공개 블로그 분석 워크스페이스</h1>
          <p className="muted sidebar-copy">
            메인 URL을 넣고 공개 글을 수집한 뒤, 게시글별 품질 점수와 보완 포인트를 한 화면에서 확인합니다.
          </p>
        </div>

        <nav className="nav">
          {links.map((link) => (
            <NavLink
              key={link.to}
              className={({ isActive }) => (isActive ? "nav-link nav-link-active" : "nav-link")}
              to={link.to}
              end={link.to === "/"}
            >
              {link.label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-note">
          <strong>기본 분석 엔진은 알고리즘입니다.</strong>
          <p className="muted">
            OpenAI, Google, Ollama는 선택형 보강 기능으로만 두고, 점수와 우선순위는 규칙 기반으로 계산합니다.
          </p>
        </div>
      </aside>

      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
