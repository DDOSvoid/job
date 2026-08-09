import { useQueryClient } from '@tanstack/react-query'
import { NavLink, Outlet } from 'react-router-dom'

const navItems = [
  { to: '/', label: '岗位', end: true },
  { to: '/companies', label: '公司', end: false },
  { to: '/interviews', label: '面试', end: false },
  { to: '/stats', label: '统计', end: false },
]

export default function Layout() {
  const qc = useQueryClient()
  return (
    <div className="layout">
      <header className="topbar">
        <span className="brand">
          <span className="brand-mark" aria-hidden="true">
            量
          </span>
          <span>量化岗位招聘记录</span>
        </span>
        <nav>
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <button
          type="button"
          className="btn refresh-btn"
          title="数据由 skill 直接写入 data/ 目录，可随时刷新查看新条目"
          onClick={() => qc.invalidateQueries()}
        >
          ↻ 刷新
        </button>
      </header>
      <main className="content">
        <Outlet />
      </main>
    </div>
  )
}
