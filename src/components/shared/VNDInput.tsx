import * as React from 'react'
import { cn } from '@/lib/utils'

interface VNDInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  value: number
  onChange: (value: number) => void
}

export function VNDInput({ value, onChange, className, ...props }: VNDInputProps) {
  const [display, setDisplay] = React.useState(value > 0 ? value.toString() : '')

  React.useEffect(() => {
    setDisplay(value > 0 ? value.toString() : '')
  }, [value])

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.replace(/\D/g, '')
    setDisplay(raw)
    onChange(raw ? parseInt(raw, 10) : 0)
  }

  return (
    <div className="relative">
      <input
        type="text"
        inputMode="numeric"
        value={display ? new Intl.NumberFormat('vi-VN').format(parseInt(display || '0')) : ''}
        onChange={handleChange}
        className={cn(
          'flex h-9 w-full rounded-md border border-gray-300 bg-white px-3 py-1 pr-12 text-sm shadow-sm placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
        {...props}
      />
      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">₫</span>
    </div>
  )
}
