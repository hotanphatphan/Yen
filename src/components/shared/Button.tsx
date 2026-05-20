import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white shadow-sm shadow-violet-500/25 focus-visible:ring-violet-500',
        destructive: 'bg-red-500 text-white hover:bg-red-600 shadow-sm shadow-red-500/20 focus-visible:ring-red-500',
        outline: 'border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 shadow-sm',
        secondary: 'bg-slate-100 text-slate-700 hover:bg-slate-200',
        ghost: 'hover:bg-slate-100 text-slate-600',
        link: 'text-violet-600 underline-offset-4 hover:underline',
        amber: 'bg-amber-400 text-slate-900 hover:bg-amber-500 shadow-sm shadow-amber-500/20',
      },
      size: {
        default: 'h-9 px-4 py-2 rounded-xl',
        sm: 'h-8 px-3 text-xs rounded-lg',
        lg: 'h-11 px-6 rounded-xl text-base',
        icon: 'h-9 w-9 rounded-xl',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = 'Button'

export { Button, buttonVariants }
