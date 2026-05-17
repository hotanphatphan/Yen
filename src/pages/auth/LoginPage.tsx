import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/shared/Button'
import { Input } from '@/components/shared/Input'
import { Label } from '@/components/shared/Label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/shared/Card'

const schema = z.object({
  email: z.string().email('Email không hợp lệ'),
  password: z.string().min(6, 'Mật khẩu ít nhất 6 ký tự'),
})
type FormData = z.infer<typeof schema>

export default function LoginPage() {
  const navigate = useNavigate()
  const [error, setError] = useState('')

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  async function onSubmit(data: FormData) {
    setError('')
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    })
    if (authError) {
      setError('Email hoặc mật khẩu không đúng')
      return
    }
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', authData.user.id)
      .single()

    if (profile?.role === 'super_admin') {
      navigate('/admin')
    } else if (profile?.role === 'accountant') {
      navigate('/dashboard')
    } else if (profile?.role === 'client') {
      navigate('/portal')
    } else {
      navigate('/login')
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4" style={{ background: 'hsl(0 0% 96%)' }}>
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight" style={{ color: 'hsl(244 54% 32%)' }}>Yen</h1>
          <p className="eyebrow-accent mt-2">Workspace kế toán · Việt Nam</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Đăng nhập</CardTitle>
            <CardDescription>Nhập thông tin tài khoản của bạn</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" placeholder="email@example.com" {...register('email')} />
                {errors.email && <p className="text-xs text-red-500">{errors.email.message}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password">Mật khẩu</Label>
                <Input id="password" type="password" placeholder="••••••" {...register('password')} />
                {errors.password && <p className="text-xs text-red-500">{errors.password.message}</p>}
              </div>

              {error && <p className="text-sm text-red-500 text-center">{error}</p>}

              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? 'Đang đăng nhập...' : 'Đăng nhập'}
              </Button>
            </form>

            <p className="mt-4 text-center text-sm text-gray-500">
              Chưa có tài khoản?{' '}
              <Link to="/register" className="font-medium hover:underline" style={{ color: 'hsl(244 54% 32%)' }}>
                Đăng ký
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
