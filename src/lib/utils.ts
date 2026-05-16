import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatVND(amount: number): string {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    minimumFractionDigits: 0,
  }).format(amount)
}

export function formatDate(dateStr: string): string {
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(dateStr))
}

export function formatDateTime(dateStr: string): string {
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(dateStr))
}

export function getCurrentQuarter(): { year: number; quarter: number } {
  const now = new Date()
  return {
    year: now.getFullYear(),
    quarter: Math.floor(now.getMonth() / 3) + 1,
  }
}

export function getPeriodLabel(period: string): string {
  if (period.includes('-Q')) {
    const [year, q] = period.split('-Q')
    return `Quý ${q}/${year}`
  }
  if (period.includes('-M')) {
    const [year, m] = period.split('-M')
    return `Tháng ${m}/${year}`
  }
  return period
}

export function isOverdue(dueDateStr: string): boolean {
  return new Date(dueDateStr) < new Date()
}

export function daysUntil(dueDateStr: string): number {
  const diff = new Date(dueDateStr).getTime() - Date.now()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}
