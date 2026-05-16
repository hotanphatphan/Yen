import { Navigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import type { UserRole } from '@/types'

interface ProtectedRouteProps {
  children: React.ReactNode
  role?: UserRole
}

export function ProtectedRoute({ children, role }: ProtectedRouteProps) {
  const { session, profile, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-gray-500">Đang tải...</div>
      </div>
    )
  }

  if (!session) return <Navigate to="/login" replace />

  if (role && profile?.role !== role) {
    if (profile?.role === 'super_admin') return <Navigate to="/admin" replace />
    return <Navigate to={profile?.role === 'accountant' ? '/dashboard' : '/portal'} replace />
  }

  return <>{children}</>
}
