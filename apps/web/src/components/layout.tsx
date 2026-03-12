import { NavLink, Outlet } from "react-router-dom";

const links = [
  { to: "/", label: "대시보드" },
  { to: "/blogs", label: "블로그" },
  { to: "/reports", label: "리포트" },
  { to: "/settings", label: "설정" },
  { to: "/logs", label: "로그" },
];

export function AppLayout() {
  return (
    <div className="shell">
      <aside className="sidebar">
        <div>
          <p className="eyebrow">LOCAL-FIRST</p>
          <h1>Blog Review Dashboard</h1>
          <p className="muted">수동 분석 중심의 블로그 전략 대시보드</p>
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
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
