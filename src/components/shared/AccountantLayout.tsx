import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Users, Calendar, LogOut, ChevronRight, Menu, X } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'

interface AccountantLayoutProps {
  children: React.ReactNode
}

const navItems = [
  {
    to: '/dashboard',
    label: 'Tổng quan',
    icon: LayoutDashboard,
    iconBg: 'bg-violet-100',
    iconColor: 'text-violet-600',
    activeBg: 'bg-violet-600',
  },
  {
    to: '/clients',
    label: 'Khách hàng',
    icon: Users,
    iconBg: 'bg-blue-100',
    iconColor: 'text-blue-600',
    activeBg: 'bg-blue-600',
  },
  {
    to: '/calendar',
    label: 'Lịch deadline',
    icon: Calendar,
    iconBg: 'bg-amber-100',
    iconColor: 'text-amber-600',
    activeBg: 'bg-amber-500',
  },
]

export function AccountantLayout({ children }: AccountantLayoutProps) {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  const initials = profile?.full_name
    ? profile.full_name.split(' ').map((w: string) => w[0]).slice(-2).join('').toUpperCase()
    : 'KT'

  const SidebarContent = () => (
    <div className="flex flex-col h-full relative overflow-hidden">
      <div className="sidebar-glow absolute inset-0 pointer-events-none" />
      <div className="sidebar-dots absolute inset-0 pointer-events-none" />

      {/* Logo */}
      <div className="relative z-10 px-5 pt-6 pb-5">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-xl flex items-center justify-center shadow-sm"
            style={{ background: 'linear-gradient(135deg, #7C3AED, #9333EA)' }}>
            <span className="text-white font-black text-base">Y</span>
          </div>
          <div>
            <h1 className="text-slate-800 font-bold text-base tracking-tight leading-none">Yen</h1>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-violet-500 mt-0.5">Kế toán</p>
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="relative z-10 mx-4 h-px bg-violet-100 mb-4" />

      {/* Nav */}
      <nav className="relative z-10 flex-1 px-3 space-y-1">
        {navItems.map(({ to, label, icon: Icon, iconBg, iconColor, activeBg }) => (
          <NavLink
            key={to}
            to={to}
            onClick={() => setSidebarOpen(false)}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-all duration-150',
                isActive
                  ? `${activeBg} text-white font-semibold shadow-sm`
                  : 'text-slate-500 hover:bg-violet-50 hover:text-violet-700'
              )
            }
          >
            {({ isActive }) => (
              <>
                <span className={cn(
                  'h-8 w-8 rounded-xl flex items-center justify-center shrink-0 transition-all',
                  isActive ? 'bg-white/20' : iconBg
                )}>
                  <Icon size={15} className={isActive ? 'text-white' : iconColor} />
                </span>
                {label}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* User footer */}
      <div className="relative z-10 p-3 mt-auto">
        <div className="rounded-xl bg-violet-50 border border-violet-100 p-3">
          <div className="flex items-center gap-3 mb-2.5">
            <div className="h-9 w-9 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0"
              style={{ background: 'linear-gradient(135deg, #F59E0B, #EF4444)' }}>
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-800 truncate">{profile?.full_name ?? 'Kế toán'}</p>
              <p className="text-xs text-slate-400 truncate">{profile?.email}</p>
            </div>
          </div>
          <button
            onClick={handleSignOut}
            className="flex w-full items-center gap-2 px-2 py-1.5 text-xs text-slate-400
              hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
          >
            <LogOut className="h-3.5 w-3.5" />
            Đăng xuất
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="flex min-h-screen" style={{ background: 'hsl(248 30% 97%)' }}>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-56 flex-col shrink-0 bg-white border-r border-violet-100/80 shadow-sm">
        <SidebarContent />
      </aside>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Mobile sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-56 flex flex-col bg-white border-r border-violet-100 shadow-xl transition-transform duration-200 md:hidden',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-violet-100">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-xl flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #7C3AED, #9333EA)' }}>
              <span className="text-white font-black text-sm">Y</span>
            </div>
            <h1 className="text-slate-800 font-bold text-base tracking-tight">Yen</h1>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="text-slate-400 hover:text-slate-700 p-1">
            <X className="h-5 w-5" />
          </button>
        </div>
        <SidebarContent />
      </aside>

      {/* Mobile top bar */}
      <div className="fixed top-0 left-0 right-0 z-30 flex items-center gap-3 px-4 py-3 bg-white border-b border-violet-100 md:hidden shadow-sm">
        <button onClick={() => setSidebarOpen(true)} className="text-slate-500 hover:text-violet-600 p-1">
          <Menu className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #7C3AED, #9333EA)' }}>
            <span className="text-white font-black text-xs">Y</span>
          </div>
          <h1 className="text-base font-bold text-slate-800 tracking-tight">Yen</h1>
        </div>
      </div>

      {/* Main content */}
      <main className="flex-1 overflow-auto pt-14 md:pt-0">
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
    <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-violet-100/80">
      <div className="flex items-center gap-3">
        <div className="h-8 w-1 rounded-full bg-violet-500" />
        <div>
          {breadcrumb && breadcrumb.length > 0 && (
            <nav className="flex items-center gap-1 text-xs text-slate-400 mb-0.5">
              {breadcrumb.map((item, i) => (
                <span key={i} className="flex items-center gap-1">
                  {i > 0 && <ChevronRight className="h-3 w-3" />}
                  <span className={item.to ? 'hover:underline cursor-pointer text-violet-500' : ''}>
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
