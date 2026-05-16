import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/shared/Button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/shared/Card'

export default function SelectRolePage() {
  const navigate = useNavigate()
  const { user, refreshProfile } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function selectRole(role: 'accountant' | 'client') {
    if (!user) return
    setLoading(true)
    setError('')
    const { error: dbError } = await supabase.from('profiles').upsert({
      id: user.id,
      email: user.email,
      role,
    })
    if (dbError) {
      setError(dbError.message)
      setLoading(false)
      return
    }
    await refreshProfile()
    if (role === 'accountant') navigate('/dashboard')
    else navigate('/portal')
    setLoading(false)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-lg space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-blue-700">Yen</h1>
          <p className="text-gray-500 mt-1">Bạn sử dụng với vai trò nào?</p>
        </div>

        {error && <p className="text-sm text-red-500 text-center bg-red-50 rounded p-2">{error}</p>}

        <div className="grid grid-cols-2 gap-4">
          <Card
            className="cursor-pointer hover:border-blue-400 hover:shadow-md transition-all"
            onClick={() => !loading && selectRole('accountant')}
          >
            <CardHeader>
              <div className="text-4xl mb-2">🧑‍💼</div>
              <CardTitle>Kế toán</CardTitle>
              <CardDescription>
                Quản lý nhiều doanh nghiệp khách hàng, theo dõi compliance và báo cáo tài chính
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full" disabled={loading} onClick={() => selectRole('accountant')}>
                Tôi là kế toán
              </Button>
            </CardContent>
          </Card>

          <Card
            className="cursor-pointer hover:border-blue-400 hover:shadow-md transition-all"
            onClick={() => !loading && selectRole('client')}
          >
            <CardHeader>
              <div className="text-4xl mb-2">🏢</div>
              <CardTitle>Chủ doanh nghiệp</CardTitle>
              <CardDescription>
                Xem trạng thái compliance, upload chứng từ và nhận báo cáo từ kế toán
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" className="w-full" disabled={loading} onClick={() => selectRole('client')}>
                Tôi là chủ DN
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
