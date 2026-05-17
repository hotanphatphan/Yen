import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Users, Calendar, LogOut, ChevronRight, Menu, X } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'

interface AccountantLayoutProps {
  children: React.ReactNode
}

export function AccountantLayout({ children }: AccountantLayoutProps) {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  const navItems = [
    { to: '/dashboard', label: 'Tổng quan', icon: LayoutDashboard },
    { to: '/clients', label: 'Khách hàng', icon: Users },
    { to: '/calendar', label: 'Lịch deadline', icon: Calendar },
  ]

  const SidebarContent = () => (
    <>
      <div className="p-4 border-b border-white/10">
        <h1 className="text-lg font-bold text-white tracking-tight">Yen</h1>
        <p className="eyebrow-accent mt-0.5">Kế toán</p>
      </div>

      <nav className="flex-1 p-2 space-y-0.5">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            onClick={() => setSidebarOpen(false)}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-2.5 px-3 py-2 text-sm transition-colors',
                isActive
                  ? 'bg-white/15 text-white font-medium'
                  : 'text-white/70 hover:bg-white/8 hover:text-white'
              )
            }
          >
            <Icon className="h-4 w-4 shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="p-3 border-t border-white/10">
        <div className="flex items-center gap-2 px-2 py-1.5 mb-1">
          <div className="h-7 w-7 flex items-center justify-center text-xs font-semibold text-white"
            style={{ background: 'hsl(190 75% 45%)' }}>
            {profile?.full_name?.charAt(0)?.toUpperCase() ?? 'K'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-white truncate">{profile?.full_name ?? 'Kế toán'}</p>
            <p className="text-xs text-white/50 truncate">{profile?.email}</p>
          </div>
        </div>
        <button
          onClick={handleSignOut}
          className="flex w-full items-center gap-2 px-3 py-2 text-sm text-white/60 hover:bg-white/8 hover:text-white transition-colors"
        >
          <LogOut className="h-4 w-4" />
          Đăng xuất
        </button>
      </div>
    </>
  )

  return (
    <div className="flex min-h-screen" style={{ background: 'hsl(0 0% 96%)' }}>
      {/* Desktop sidebar */}
      <aside
        className="hidden md:flex w-56 flex-col"
        style={{ background: 'hsl(244 47% 20%)' }}
      >
        <SidebarContent />
      </aside>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Mobile sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-56 flex flex-col transition-transform duration-200 md:hidden',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
        style={{ background: 'hsl(244 47% 20%)' }}
      >
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <h1 className="text-lg font-bold text-white tracking-tight">Yen</h1>
          <button onClick={() => setSidebarOpen(false)} className="text-white/60 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="flex-1 p-2 space-y-0.5">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2.5 px-3 py-2 text-sm transition-colors',
                  isActive
                    ? 'bg-white/15 text-white font-medium'
                    : 'text-white/70 hover:bg-white/8 hover:text-white'
                )
              }
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t border-white/10">
          <button
            onClick={handleSignOut}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-white/60 hover:bg-white/8 hover:text-white transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Đăng xuất
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="fixed top-0 left-0 right-0 z-30 flex items-center gap-3 px-4 py-3 md:hidden"
        style={{ background: 'hsl(244 47% 20%)' }}>
        <button onClick={() => setSidebarOpen(true)} className="text-white">
          <Menu className="h-5 w-5" />
        </button>
        <h1 className="text-base font-bold text-white tracking-tight">Yen</h1>
      </div>

      {/* Main content */}
      <main className="flex-1 overflow-auto pt-12 md:pt-0">
        {children}
      </main>
    </div>
  )
}

interface PageHeaderProps {
  title: string
  subtitle?: string
  breadcrumb?: { label: string; to?: string }[]
  actions?: React.ReactNode
}

export function PageHeader({ title, subtitle, breadcrumb, actions }: PageHeaderProps) {
  return (
    <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-gray-200">
      <div>
        {breadcrumb && breadcrumb.length > 0 && (
          <nav className="flex items-center gap-1 text-xs text-gray-400 mb-1">
            {breadcrumb.map((item, i) => (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="h-3 w-3" />}
                <span className={item.to ? 'hover:underline cursor-pointer' : ''}
                  style={item.to ? { color: 'hsl(244 54% 32%)' } : {}}>
                  {item.label}
                </span>
              </span>
            ))}
          </nav>
        )}
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
        {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}
