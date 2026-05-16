import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Copy, Check, LogOut, Plus } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { Invitation } from '@/types'
import { Button } from '@/components/shared/Button'
import { Input } from '@/components/shared/Input'
import { Label } from '@/components/shared/Label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/shared/Card'
import { Badge } from '@/components/shared/Badge'
import { formatDate } from '@/lib/utils'

export default function AdminPage() {
  const navigate = useNavigate()
  const { user, profile, signOut } = useAuth()
  const qc = useQueryClient()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'accountant' | 'client'>('accountant')
  const [error, setError] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const { data: invitations = [] } = useQuery({
    queryKey: ['invitations'],
    queryFn: async () => {
      const { data } = await supabase.from('invitations').select('*').order('created_at', { ascending: false })
      return (data ?? []) as Invitation[]
    },
  })

  const { data: accountants = [] } = useQuery({
    queryKey: ['accountants'],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('id, email, full_name, created_at').eq('role', 'accountant').order('created_at', { ascending: false })
      return data ?? []
    },
  })

  const createInvitation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not logged in')
      const { data, error } = await supabase.from('invitations').insert({
        email: email.trim() || null,
        role,
        invited_by: user.id,
      }).select().single()
      if (error) throw error
      return data as Invitation
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invitations'] })
      setEmail('')
      setError('')
    },
    onError: (e: Error) => setError(e.message),
  })

  function getInviteUrl(token: string) {
    return `${window.location.origin}/invite/${token}`
  }

  async function copyLink(id: string) {
    await navigator.clipboard.writeText(getInviteUrl(id))
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between max-w-5xl mx-auto">
          <div>
            <h1 className="text-xl font-bold text-blue-700">Yen</h1>
            <p className="text-xs text-gray-500">Super Admin</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-600">{profile?.full_name ?? profile?.email}</span>
            <button onClick={handleSignOut} className="text-sm text-gray-400 hover:text-gray-600 flex items-center gap-1">
              <LogOut className="h-4 w-4" /> Đăng xuất
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto p-6 space-y-6">
        <div className="grid grid-cols-2 gap-6">
          {/* Create invitation */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Tạo link mời</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label>Email (tuỳ chọn)</Label>
                <Input
                  type="email"
                  placeholder="email@example.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                />
                <p className="text-xs text-gray-400">Nếu để trống, người nhận link phải có email để đăng ký</p>
              </div>

              <div className="space-y-1.5">
                <Label>Vai trò</Label>
                <div className="flex gap-2">
                  {(['accountant', 'client'] as const).map(r => (
                    <button
                      key={r}
                      onClick={() => setRole(r)}
                      className={`flex-1 rounded-lg border py-2 text-sm font-medium transition-colors ${
                        role === r ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      {r === 'accountant' ? 'Kế toán' : 'Chủ DN'}
                    </button>
                  ))}
                </div>
              </div>

              {error && <p className="text-xs text-red-500">{error}</p>}

              <Button
                className="w-full"
                onClick={() => createInvitation.mutate()}
                disabled={createInvitation.isPending}
              >
                <Plus className="h-4 w-4" />
                {createInvitation.isPending ? 'Đang tạo...' : 'Tạo link mời'}
              </Button>
            </CardContent>
          </Card>

          {/* Accountant list */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Kế toán đã đăng ký ({accountants.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {accountants.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">Chưa có kế toán nào</p>
              ) : (
                <div className="space-y-2">
                  {accountants.map((a: { id: string; email: string; full_name: string | null; created_at: string }) => (
                    <div key={a.id} className="flex items-center justify-between py-1.5">
                      <div>
                        <p className="text-sm font-medium text-gray-800">{a.full_name ?? '—'}</p>
                        <p className="text-xs text-gray-400">{a.email}</p>
                      </div>
                      <p className="text-xs text-gray-400">{formatDate(a.created_at)}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Invitation list */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Danh sách link mời</CardTitle>
          </CardHeader>
          <CardContent>
            {invitations.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">Chưa có link mời nào</p>
            ) : (
              <div className="space-y-2">
                {invitations.map(inv => (
                  <div key={inv.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                    <div className="flex items-center gap-3">
                      <Badge variant={inv.role === 'accountant' ? 'default' : 'warning'} className="text-xs shrink-0">
                        {inv.role === 'accountant' ? 'Kế toán' : 'Chủ DN'}
                      </Badge>
                      <div>
                        <p className="text-sm text-gray-700">{inv.email ?? 'Không có email'}</p>
                        <p className="text-xs text-gray-400">{formatDate(inv.created_at)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {inv.used_at ? (
                        <Badge variant="default" className="text-xs">Đã dùng</Badge>
                      ) : (
                        <button
                          onClick={() => copyLink(inv.id)}
                          className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 border border-blue-200 rounded px-2 py-1"
                        >
                          {copiedId === inv.id ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                          {copiedId === inv.id ? 'Đã copy' : 'Copy link'}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
