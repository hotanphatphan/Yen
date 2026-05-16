import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { supabase } from '@/lib/supabase'
import type { Invitation } from '@/types'
import { Button } from '@/components/shared/Button'
import { Input } from '@/components/shared/Input'
import { Label } from '@/components/shared/Label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/shared/Card'

const schema = z.object({
  full_name: z.string().min(2, 'Tên ít nhất 2 ký tự'),
  password: z.string().min(6, 'Mật khẩu ít nhất 6 ký tự'),
  confirm_password: z.string(),
}).refine(d => d.password === d.confirm_password, {
  message: 'Mật khẩu xác nhận không khớp',
  path: ['confirm_password'],
})
type FormData = z.infer<typeof schema>

export default function InvitePage() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const [invitation, setInvitation] = useState<Invitation | null>(null)
  const [loadingInvite, setLoadingInvite] = useState(true)
  const [inviteError, setInviteError] = useState('')
  const [submitError, setSubmitError] = useState('')

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  useEffect(() => {
    async function loadInvitation() {
      if (!token) { setInviteError('Link không hợp lệ.'); setLoadingInvite(false); return }
      const { data, error } = await supabase
        .from('invitations')
        .select('*')
        .eq('id', token)
        .single()
      if (error || !data) { setInviteError('Link mời không tồn tại hoặc đã hết hạn.'); setLoadingInvite(false); return }
      if (data.used_at) { setInviteError('Link mời này đã được sử dụng.'); setLoadingInvite(false); return }
      setInvitation(data as Invitation)
      setLoadingInvite(false)
    }
    loadInvitation()
  }, [token])

  async function onSubmit(data: FormData) {
    if (!invitation) return
    setSubmitError('')

    const email = invitation.email
    if (!email) { setSubmitError('Link mời không có email. Liên hệ người mời.'); return }

    const { data: authData, error: signUpError } = await supabase.auth.signUp({
      email,
      password: data.password,
      options: { data: { full_name: data.full_name } },
    })
    if (signUpError) { setSubmitError(signUpError.message); return }
    if (!authData.user) { setSubmitError('Đăng ký thất bại.'); return }

    const { error: profileError } = await supabase.from('profiles').upsert({
      id: authData.user.id,
      email,
      full_name: data.full_name,
      role: invitation.role,
      company_id: invitation.company_id,
    })
    if (profileError) { setSubmitError(profileError.message); return }

    await supabase.from('invitations').update({ used_at: new Date().toISOString() }).eq('id', invitation.id)

    if (invitation.role === 'accountant') navigate('/dashboard')
    else navigate('/portal')
  }

  if (loadingInvite) {
    return <div className="flex min-h-screen items-center justify-center text-gray-500">Đang kiểm tra link mời...</div>
  }

  if (inviteError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-blue-700 mb-2">Yen</h1>
          <p className="text-red-500">{inviteError}</p>
          <Button className="mt-4" variant="outline" onClick={() => navigate('/login')}>Về trang đăng nhập</Button>
        </div>
      </div>
    )
  }

  const roleLabel = invitation?.role === 'accountant' ? 'Kế toán' : 'Chủ doanh nghiệp'

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-blue-700">Yen</h1>
          <p className="text-sm text-gray-500 mt-1">Bạn được mời với vai trò <strong>{roleLabel}</strong></p>
          {invitation?.email && <p className="text-xs text-gray-400 mt-0.5">{invitation.email}</p>}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Tạo tài khoản</CardTitle>
            <CardDescription>Điền thông tin để hoàn tất đăng ký</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="full_name">Họ và tên</Label>
                <Input id="full_name" placeholder="Nguyễn Văn A" {...register('full_name')} />
                {errors.full_name && <p className="text-xs text-red-500">{errors.full_name.message}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password">Mật khẩu</Label>
                <Input id="password" type="password" placeholder="••••••" {...register('password')} />
                {errors.password && <p className="text-xs text-red-500">{errors.password.message}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="confirm_password">Xác nhận mật khẩu</Label>
                <Input id="confirm_password" type="password" placeholder="••••••" {...register('confirm_password')} />
                {errors.confirm_password && <p className="text-xs text-red-500">{errors.confirm_password.message}</p>}
              </div>

              {submitError && <p className="text-sm text-red-500 text-center">{submitError}</p>}

              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? 'Đang tạo tài khoản...' : 'Tạo tài khoản'}
              </Button>
            </form>

            <p className="mt-4 text-center text-sm text-gray-500">
              Đã có tài khoản?{' '}
              <button onClick={() => navigate('/login')} className="text-blue-600 hover:underline font-medium">Đăng nhập</button>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
