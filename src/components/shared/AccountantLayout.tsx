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

  const initials = profile?.full_name
    ? profile.full_name.split(' ').map((w: string) => w[0]).slice(-2).join('').toUpperCase()
    : 'KT'

  const SidebarContent = () => (
    <div className="flex flex-col h-full relative overflow-hidden">
      {/* Glow blob */}
      <div className="sidebar-glow absolute inset-0 pointer-events-none" />
      {/* Dot pattern */}
      <div className="sidebar-dots absolute inset-0 pointer-events-none" />

      {/* Logo */}
      <div className="relative z-10 px-5 pt-6 pb-5">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #6366F1, #8B5CF6)' }}>
            <span className="text-white font-bold text-sm">Y</span>
          </div>
          <div>
            <h1 className="text-white font-bold text-base tracking-tight leading-none">Yen</h1>
            <p className="eyebrow-accent mt-0.5">Kế toán</p>
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="relative z-10 mx-4 h-px bg-white/10 mb-4" />

      {/* Nav */}
      <nav className="relative z-10 flex-1 px-3 space-y-1">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            onClick={() => setSidebarOpen(false)}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-150',
                isActive
                  ? 'bg-indigo-500/25 text-white font-semibold border-l-2 border-indigo-400 pl-[10px]'
                  : 'text-slate-400 hover:bg-white/8 hover:text-white'
              )
            }
          >
            <Icon className="h-4 w-4 shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* User footer */}
      <div className="relative z-10 p-3 mt-auto">
        <div className="sidebar-dots absolute inset-x-0 bottom-0 h-24 pointer-events-none opacity-50" />
        <div className="relative rounded-xl bg-white/8 border border-white/10 p-3">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-9 w-9 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0"
              style={{ background: 'linear-gradient(135deg, #F59E0B, #EF4444)' }}>
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white truncate">{profile?.full_name ?? 'Kế toán'}</p>
              <p className="text-xs text-slate-400 truncate">{profile?.email}</p>
            </div>
          </div>
          <button
            onClick={handleSignOut}
            className="flex w-full items-center gap-2 px-2 py-1.5 text-xs text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          >
            <LogOut className="h-3.5 w-3.5" />
            Đăng xuất
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="flex min-h-screen" style={{ background: 'hsl(214 32% 97%)' }}>
      {/* Desktop sidebar */}
      <aside
        className="hidden md:flex w-60 flex-col shrink-0"
        style={{ background: '#0F172A' }}
      >
        <SidebarContent />
      </aside>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 md:hidden backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Mobile sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-60 flex flex-col transition-transform duration-200 md:hidden',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
        style={{ background: '#0F172A' }}
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #6366F1, #8B5CF6)' }}>
              <span className="text-white font-bold text-sm">Y</span>
            </div>
            <h1 className="text-white font-bold text-base tracking-tight">Yen</h1>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="text-slate-400 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>
        <SidebarContent />
      </aside>

      {/* Mobile top bar */}
      <div className="fixed top-0 left-0 right-0 z-30 flex items-center gap-3 px-4 py-3 md:hidden"
        style={{ background: '#0F172A' }}>
        <button onClick={() => setSidebarOpen(true)} className="text-slate-400 hover:text-white">
          <Menu className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded-md flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #6366F1, #8B5CF6)' }}>
            <span className="text-white font-bold text-xs">Y</span>
          </div>
          <h1 className="text-base font-bold text-white tracking-tight">Yen</h1>
        </div>
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
    <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-slate-100">
      <div className="flex items-center gap-3">
        <div className="h-8 w-1 rounded-full bg-indigo-500" />
        <div>
          {breadcrumb && breadcrumb.length > 0 && (
            <nav className="flex items-center gap-1 text-xs text-slate-400 mb-0.5">
              {breadcrumb.map((item, i) => (
                <span key={i} className="flex items-center gap-1">
                  {i > 0 && <ChevronRight className="h-3 w-3" />}
                  <span className={item.to ? 'hover:underline cursor-pointer text-indigo-500' : ''}>
                    {item.label}
                  </span>
                </span>
              ))}
            </nav>
          )}
          <h2 className="text-lg font-bold text-slate-900">{title}</h2>
          {subtitle && <p className="text-sm text-slate-400 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}
