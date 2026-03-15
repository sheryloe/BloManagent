import { NavLink, Outlet } from "react-router-dom";

const links = [
  { to: "/", label: "대시보드" },
  { to: "/blogs", label: "블로그" },
  { to: "/reports", label: "리포트" },
  { to: "/help", label: "도움말" },
  { to: "/settings", label: "설정" },
  { to: "/logs", label: "로그" },
];

export function AppLayout() {
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <p className="eyebrow">BloManagent</p>
          <h1>블로그 분석 워크스페이스</h1>
          <p className="muted sidebar-copy">
            메인 URL 등록부터 공개 페이지 수집, 분석 실행, 다음 액션 정리까지 한 화면에서 관리합니다.
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
          <strong>공개 블로그만 다룹니다.</strong>
          <p className="muted">
            로그인 우회나 비공개 글 수집은 하지 않고, 공개 URL 기준으로 RSS, sitemap, 본문 페이지를 순차 확인합니다.
          </p>
        </div>
      </aside>

      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
