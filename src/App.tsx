import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '@/hooks/useAuth'
import { ProtectedRoute } from '@/components/shared/ProtectedRoute'

import LoginPage from '@/pages/auth/LoginPage'
import RegisterPage from '@/pages/auth/RegisterPage'
import InvitePage from '@/pages/auth/InvitePage'

import AdminPage from '@/pages/admin/AdminPage'

import DashboardPage from '@/pages/accountant/DashboardPage'
import ClientsPage from '@/pages/accountant/ClientsPage'
import ClientDetailPage from '@/pages/accountant/ClientDetailPage'
import CalendarPage from '@/pages/accountant/CalendarPage'
import InvoicesPage from '@/pages/accountant/InvoicesPage'

import PortalPage from '@/pages/portal/PortalPage'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 1000 * 30, retry: 1 },
  },
})

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            {/* Public */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/invite/:token" element={<InvitePage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/select-role" element={<Navigate to="/login" replace />} />

            {/* Super Admin */}
            <Route path="/admin" element={<ProtectedRoute role="super_admin"><AdminPage /></ProtectedRoute>} />

            {/* Accountant */}
            <Route path="/dashboard" element={<ProtectedRoute role="accountant"><DashboardPage /></ProtectedRoute>} />
            <Route path="/clients" element={<ProtectedRoute role="accountant"><ClientsPage /></ProtectedRoute>} />
            <Route path="/clients/:companyId" element={<ProtectedRoute role="accountant"><ClientDetailPage /></ProtectedRoute>} />
            <Route path="/invoices" element={<ProtectedRoute role="accountant"><InvoicesPage /></ProtectedRoute>} />
            <Route path="/calendar" element={<ProtectedRoute role="accountant"><CalendarPage /></ProtectedRoute>} />

            {/* Client Portal */}
            <Route path="/portal" element={<ProtectedRoute role="client"><PortalPage /></ProtectedRoute>} />

            {/* Default */}
            <Route path="/" element={<Navigate to="/login" replace />} />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  )
}
