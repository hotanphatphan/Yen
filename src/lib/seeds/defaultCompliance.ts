import type { ComplianceType } from '@/types'
import { addDays, addMonths, setDate } from 'date-fns'

interface ComplianceSeed {
  type: ComplianceType
  name: string
  period: string
  due_date: string
}

function formatPeriod(year: number, quarter: number) {
  return `${year}-Q${quarter}`
}

function formatMonthPeriod(year: number, month: number) {
  return `${year}-M${String(month).padStart(2, '0')}`
}

export function generateDefaultCompliance(): ComplianceSeed[] {
  const now = new Date()
  const year = now.getFullYear()
  const currentMonth = now.getMonth() + 1
  const currentQuarter = Math.ceil(currentMonth / 3)

  const items: ComplianceSeed[] = []

  // VAT quarterly — current + next 3 quarters
  for (let i = 0; i < 4; i++) {
    const q = ((currentQuarter - 1 + i) % 4) + 1
    const y = year + Math.floor((currentQuarter - 1 + i) / 4)
    const dueDate = new Date(y, q * 3, 30) // 30th of last month of quarter + 30 days
    const adjustedDue = addDays(new Date(y, q * 3, 1), 29)
    items.push({
      type: 'vat_quarterly',
      name: `Khai thuế VAT ${formatPeriod(y, q)}`,
      period: formatPeriod(y, q),
      due_date: adjustedDue.toISOString().split('T')[0],
    })
    void dueDate
  }

  // Payroll monthly — current + next 3 months
  for (let i = 0; i < 4; i++) {
    const monthOffset = currentMonth - 1 + i
    const m = (monthOffset % 12) + 1
    const y = year + Math.floor(monthOffset / 12)
    const dueDate = setDate(addMonths(new Date(y, m - 1, 1), 1), 20)
    items.push({
      type: 'payroll_monthly',
      name: `Khai thuế TNCN ${formatMonthPeriod(y, m)}`,
      period: formatMonthPeriod(y, m),
      due_date: dueDate.toISOString().split('T')[0],
    })
  }

  // BCTC annual — current year
  items.push({
    type: 'bctc_annual',
    name: `BCTC năm ${year}`,
    period: `${year}`,
    due_date: `${year + 1}-03-31`,
  })

  return items
}
