import { useState } from 'react'
import { Plus, Trash2, ArrowDownCircle, ArrowUpCircle, FileSpreadsheet } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/shared/Button'
import { Card, CardContent } from '@/components/shared/Card'
import { Input } from '@/components/shared/Input'
import { Label } from '@/components/shared/Label'
import { VNDInput } from '@/components/shared/VNDInput'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/shared/Select'
import { supabase } from '@/lib/supabase'
import { formatDate, formatVND } from '@/lib/utils'
import { DEFAULT_ACCOUNTS } from '@/lib/seeds/defaultAccounts'
import type { JournalEntry } from '@/types'
import { downloadExcel, vnDate } from '@/lib/excelExport'

const ALL_ACCOUNTS = DEFAULT_ACCOUNTS

// Cash entries are journal_entries with type='cash'
export default function CashLedgerTab({ companyId }: { companyId: string }) {
  const qc = useQueryClient()
  const [type, setType] = useState<'thu' | 'chi'>('thu')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [description, setDescription] = useState('')
  const [counterAccount, setCounterAccount] = useState('511')
  const [amount, setAmount] = useState(0)
  const [submitting, setSubmitting] = useState(false)

  const { data: entries = [] } = useQuery({
    queryKey: ['cash-entries', companyId],
    queryFn: async () => {
      const { data } = await supabase
        .from('journal_entries')
        .select('*')
        .eq('company_id', companyId)
        .eq('type', 'cash')
        .order('date', { ascending: false })
      return (data ?? []) as JournalEntry[]
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from('journal_entries').delete().eq('id', id)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cash-entries', companyId] }),
  })

  const balance = entries.reduce((sum, e) => {
    // Thu: debit 111 (positive), Chi: credit 111 (negative)
    if (e.debit_account === '111') return sum + e.amount
    if (e.credit_account === '111') return sum - e.amount
    return sum
  }, 0)

  // Sổ quỹ tiền mặt: theo thứ tự ngày, có số tồn quỹ sau mỗi phiếu
  function exportCashBook() {
    let run = 0
    const rows = [...entries].sort((a, b) => a.date.localeCompare(b.date)).map((e, i) => {
      const thu = e.debit_account === '111' ? e.amount : 0
      const chi = e.credit_account === '111' ? e.amount : 0
      run += thu - chi
      return [i + 1, vnDate(e.date), e.description, thu ? 'Phiếu thu' : 'Phiếu chi', thu ? e.credit_account : e.debit_account, thu || '', chi || '', run]
    })
    downloadExcel('so-quy-tien-mat', [{
      name: 'Sổ quỹ tiền mặt',
      title: ['SỔ QUỸ TIỀN MẶT (TK 111)'],
      header: ['STT', 'Ngày', 'Diễn giải', 'Loại phiếu', 'TK đối ứng', 'Thu', 'Chi', 'Tồn quỹ'],
      rows: [...rows, ['', '', 'TỔNG CỘNG', '', '', rows.reduce((s, r) => s + (Number(r[5]) || 0), 0), rows.reduce((s, r) => s + (Number(r[6]) || 0), 0), run]],
      widths: [6, 11, 50, 11, 10, 15, 15, 15],
    }])
  }

  async function handleAdd() {
    if (!amount || !description) return
    setSubmitting(true)
    const debit = type === 'thu' ? '111' : counterAccount
    const credit = type === 'thu' ? counterAccount : '111'
    try {
      // PHẢI kiểm tra lỗi — nếu insert hỏng mà vẫn xóa form thì phiếu thu/chi
      // coi như "đã lưu" nhưng thực tế mất, không lên sổ quỹ / cân đối.
      const { error } = await supabase.from('journal_entries').insert({
        company_id: companyId,
        date,
        description,
        type: 'cash',
        debit_account: debit,
        credit_account: credit,
        amount,
        status: 'posted',
      })
      if (error) throw error
      qc.invalidateQueries({ queryKey: ['cash-entries', companyId] })
      qc.invalidateQueries({ queryKey: ['all-journal-entries', companyId] }) // cân đối thử cập nhật ngay
      setDescription('')
      setAmount(0)
    } catch (err) {
      alert('Lưu phiếu thất bại: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Balance */}
      <div className={`rounded-xl p-4 border-2 ${balance >= 0 ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
        <p className="text-sm text-slate-500">Số dư quỹ tiền mặt (TK 111)</p>
        <p className={`text-3xl font-bold mt-1 font-mono ${balance >= 0 ? 'text-green-700' : 'text-red-600'}`}>
          {formatVND(balance)}
        </p>
      </div>

      {/* Form */}
      <Card>
        <CardContent className="pt-4 space-y-3">
          <div className="flex gap-2">
            {(['thu', 'chi'] as const).map(t => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                  type === t
                    ? t === 'thu' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                }`}
              >
                {t === 'thu'
                  ? <ArrowDownCircle className="h-4 w-4" />
                  : <ArrowUpCircle className="h-4 w-4" />}
                {t === 'thu' ? 'Phiếu thu' : 'Phiếu chi'}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Ngày</Label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>TK đối ứng</Label>
              <Select value={counterAccount} onValueChange={setCounterAccount}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ALL_ACCOUNTS.map(a => (
                    <SelectItem key={a.code} value={a.code}>{a.code} — {a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Diễn giải</Label>
              <Input
                placeholder={type === 'thu' ? 'VD: Thu tiền bán hàng khách A' : 'VD: Chi tiền mua văn phòng phẩm'}
                value={description}
                onChange={e => setDescription(e.target.value)}
              />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Số tiền</Label>
              <VNDInput value={amount} onChange={setAmount} placeholder="0" />
            </div>
          </div>

          {amount > 0 && (
            <div className={`rounded-lg p-3 text-xs space-y-1 ${type === 'thu' ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
              <p className="font-medium">{type === 'thu' ? 'Bút toán phiếu thu:' : 'Bút toán phiếu chi:'}</p>
              {type === 'thu' ? (
                <>
                  <p>Nợ TK 111 (Tiền mặt): {formatVND(amount)}</p>
                  <p>Có TK {counterAccount}: {formatVND(amount)}</p>
                </>
              ) : (
                <>
                  <p>Nợ TK {counterAccount}: {formatVND(amount)}</p>
                  <p>Có TK 111 (Tiền mặt): {formatVND(amount)}</p>
                </>
              )}
            </div>
          )}

          <Button onClick={handleAdd} disabled={!amount || !description || submitting}>
            {submitting ? 'Đang lưu...' : <><Plus className="h-4 w-4" />{type === 'thu' ? 'Lập phiếu thu' : 'Lập phiếu chi'}</>}
          </Button>
        </CardContent>
      </Card>

      {/* Entry list */}
      {entries.length > 0 && (
        <div className="space-y-1">
          <div className="flex justify-end px-2">
            <Button size="sm" variant="outline" onClick={exportCashBook}>
              <FileSpreadsheet className="h-3.5 w-3.5" /> Xuất Excel
            </Button>
          </div>
          <div className="grid grid-cols-5 gap-2 px-2 text-xs text-slate-400 font-medium">
            <span>Ngày</span>
            <span className="col-span-2">Diễn giải</span>
            <span className="text-right">Thu</span>
            <span className="text-right">Chi</span>
          </div>
          {entries.map(e => {
            const isThu = e.debit_account === '111'
            return (
              <div key={e.id} className="grid grid-cols-5 gap-2 items-center p-2.5 rounded-lg border border-slate-100 hover:bg-slate-50 text-sm group">
                <span className="text-xs text-slate-400">{formatDate(e.date)}</span>
                <span className="col-span-2 text-slate-800 truncate">{e.description}</span>
                <span className={`text-right font-mono ${isThu ? 'text-green-600 font-medium' : 'text-slate-300'}`}>
                  {isThu ? formatVND(e.amount) : '—'}
                </span>
                <div className="flex items-center justify-end gap-1">
                  <span className={`font-mono ${!isThu ? 'text-red-600 font-medium' : 'text-slate-300'}`}>
                    {!isThu ? formatVND(e.amount) : '—'}
                  </span>
                  <button
                    onClick={() => deleteMutation.mutate(e.id)}
                    className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-400 transition-all"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {entries.length === 0 && (
        <p className="text-sm text-slate-400 text-center py-4">Chưa có phiếu thu/chi nào.</p>
      )}
    </div>
  )
}
