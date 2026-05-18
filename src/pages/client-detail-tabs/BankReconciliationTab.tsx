import { useState } from 'react'
import { Upload, Link2, Plus } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/shared/Button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/shared/Card'
import { Badge } from '@/components/shared/Badge'
import { supabase } from '@/lib/supabase'
import { parseBankStatementWithGemini } from '@/lib/excel/parseBankStatement'
import { useTransactions } from '@/hooks/useTransactions'
import { formatDate, formatVND } from '@/lib/utils'
import type { BankTransaction, BankStatement } from '@/types'

export default function BankReconciliationTab({ companyId }: { companyId: string }) {
  const qc = useQueryClient()
  const [parsing, setParsing] = useState(false)
  const [matchingBankId, setMatchingBankId] = useState<string | null>(null)

  const { data: statements = [] } = useQuery({
    queryKey: ['bank-statements', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('bank_statements').select('*').eq('company_id', companyId).order('created_at', { ascending: false })
      return (data ?? []) as BankStatement[]
    },
  })

  const { data: bankTransactions = [] } = useQuery({
    queryKey: ['bank-transactions', companyId],
    queryFn: async () => {
      const { data } = await supabase.from('bank_transactions').select('*').eq('company_id', companyId).order('date', { ascending: false })
      return (data ?? []) as BankTransaction[]
    },
  })

  const { data: ledgerTransactions = [] } = useTransactions(companyId, { status: 'official' })

  const matchMutation = useMutation({
    mutationFn: async ({ bankTxId, ledgerTxId }: { bankTxId: string; ledgerTxId: string }) => {
      await supabase.from('bank_transactions')
        .update({ matched_transaction_id: ledgerTxId, status: 'matched' })
        .eq('id', bankTxId)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bank-transactions', companyId] })
      setMatchingBankId(null)
    },
  })

  const createFromBankMutation = useMutation({
    mutationFn: async (bankTx: BankTransaction) => {
      const { data: tx } = await supabase.from('transactions').insert({
        company_id: companyId,
        date: bankTx.date,
        type: bankTx.amount > 0 ? 'income' : 'expense',
        amount: Math.abs(bankTx.amount),
        vat_amount: 0,
        description: bankTx.description,
        status: 'official',
        source: 'bank_import',
        needs_review: false,
      }).select().single()
      if (tx) {
        await supabase.from('bank_transactions')
          .update({ matched_transaction_id: tx.id, status: 'matched' })
          .eq('id', bankTx.id)
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bank-transactions', companyId] })
      qc.invalidateQueries({ queryKey: ['transactions', companyId] })
    },
  })

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setParsing(true)
    try {
      const buffer = await file.arrayBuffer()
      const rows = await parseBankStatementWithGemini(buffer)

      const { data: stmt } = await supabase.from('bank_statements').insert({
        company_id: companyId,
        file_name: file.name,
      }).select().single()

      if (stmt && rows.length > 0) {
        await supabase.from('bank_transactions').insert(
          rows.map(r => ({
            statement_id: stmt.id,
            company_id: companyId,
            date: r.date,
            description: r.description,
            amount: r.amount,
            balance: r.balance,
            status: 'unmatched',
          }))
        )
        qc.invalidateQueries({ queryKey: ['bank-statements', companyId] })
        qc.invalidateQueries({ queryKey: ['bank-transactions', companyId] })
      }
    } catch {
      alert('Lỗi đọc file. Thử lại với file CSV/Excel từ ngân hàng.')
    }
    setParsing(false)
    e.target.value = ''
  }

  const matched = bankTransactions.filter(t => t.status === 'matched')
  const unmatched = bankTransactions.filter(t => t.status === 'unmatched')
  const totalDiff = unmatched.reduce((s, t) => s + t.amount, 0)

  const unmatchedLedger = ledgerTransactions.filter(
    t => !bankTransactions.some(bt => bt.matched_transaction_id === t.id)
  )

  // Ending balance comparison
  const sortedByDate = [...bankTransactions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  const bankEndingBalance = sortedByDate[0]?.balance ?? null
  const softwareEndingBalance = ledgerTransactions.reduce((sum, t) => {
    return t.type === 'income' ? sum + t.amount : sum - t.amount
  }, 0)
  const balanceDiff = bankEndingBalance !== null ? Math.round(bankEndingBalance) - Math.round(softwareEndingBalance) : null

  return (
    <div className="space-y-4">
      {/* Import */}
      <div className="flex items-center gap-3">
        <input type="file" accept=".csv,.xlsx,.xls" className="hidden" id="bank-import" onChange={handleImport} />
        <label htmlFor="bank-import">
          <Button asChild variant="outline" disabled={parsing}>
            <span><Upload className="h-4 w-4" />{parsing ? 'Đang đọc...' : 'Import sao kê ngân hàng'}</span>
          </Button>
        </label>
        <p className="text-xs text-gray-500">Hỗ trợ CSV/Excel từ VCB, TCB, BIDV, MB và các ngân hàng khác</p>
      </div>

      {bankTransactions.length > 0 && (
        <>
          {/* Ending balance comparison */}
          {bankEndingBalance !== null && (
            <div className={`rounded-lg border-2 p-4 ${balanceDiff === 0 ? 'border-green-300 bg-green-50' : 'border-red-200 bg-red-50'}`}>
              <p className="text-sm font-semibold text-gray-800 mb-3">Đối chiếu số dư cuối kỳ</p>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Số dư theo sao kê ngân hàng</span>
                  <span className="font-medium">{formatVND(bankEndingBalance)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Số dư theo phần mềm (TK 112)</span>
                  <span className="font-medium">{formatVND(softwareEndingBalance)}</span>
                </div>
                <div className="flex justify-between items-center border-t pt-2 mt-1">
                  <span className="font-semibold">Chênh lệch</span>
                  {balanceDiff === 0
                    ? <span className="font-bold text-green-600 flex items-center gap-1">
                        <span>0 ✓ Đã đối chiếu xong</span>
                      </span>
                    : <span className="font-bold text-red-600">{formatVND(Math.abs(balanceDiff as number))} (chưa khớp)</span>
                  }
                </div>
              </div>
            </div>
          )}

          {/* Summary */}
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Đã khớp', value: matched.length, color: 'text-green-600' },
              { label: 'Chưa khớp', value: unmatched.length, color: 'text-amber-600' },
              { label: 'Chênh lệch', value: formatVND(Math.abs(totalDiff)), color: 'text-red-600' },
            ].map(({ label, value, color }) => (
              <Card key={label}>
                <CardContent className="py-3">
                  <p className="text-xs text-gray-500">{label}</p>
                  <p className={`text-lg font-bold ${color}`}>{value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Unmatched bank transactions */}
          {unmatched.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Giao dịch ngân hàng chưa khớp ({unmatched.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {unmatched.map(bt => (
                    <div key={bt.id} className="p-3 rounded border border-amber-100 bg-amber-50">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-gray-900 truncate max-w-xs">{bt.description}</p>
                          <p className="text-xs text-gray-500">{formatDate(bt.date)}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`font-medium text-sm ${bt.amount > 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {bt.amount > 0 ? '+' : ''}{formatVND(bt.amount)}
                          </span>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setMatchingBankId(matchingBankId === bt.id ? null : bt.id)}
                          >
                            <Link2 className="h-3.5 w-3.5" /> Khớp
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => createFromBankMutation.mutate(bt)}
                          >
                            <Plus className="h-3.5 w-3.5" /> Tạo mới
                          </Button>
                        </div>
                      </div>
                      {matchingBankId === bt.id && (
                        <div className="mt-2 border-t border-amber-200 pt-2">
                          <p className="text-xs text-gray-500 mb-1">Chọn giao dịch trong sổ để khớp:</p>
                          <div className="space-y-1 max-h-40 overflow-y-auto">
                            {unmatchedLedger.map(lt => (
                              <button
                                key={lt.id}
                                onClick={() => matchMutation.mutate({ bankTxId: bt.id, ledgerTxId: lt.id })}
                                className="w-full text-left p-2 rounded text-xs hover:bg-white border border-transparent hover:border-blue-200 transition-colors"
                              >
                                <span className="font-medium">{lt.description || lt.counterparty || '—'}</span>
                                <span className="text-gray-400 ml-2">{formatDate(lt.date)}</span>
                                <span className={`ml-2 ${lt.type === 'income' ? 'text-green-600' : 'text-red-600'}`}>
                                  {formatVND(lt.amount)}
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Matched */}
          {matched.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Đã khớp ({matched.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1">
                  {matched.map(bt => (
                    <div key={bt.id} className="flex items-center justify-between p-2 rounded text-xs bg-green-50">
                      <span className="text-gray-600 truncate max-w-xs">{bt.description}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-gray-400">{formatDate(bt.date)}</span>
                        <Badge variant="success">Khớp</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {bankTransactions.length === 0 && statements.length === 0 && (
        <Card>
          <CardContent className="text-center py-10 text-gray-400 text-sm">
            Chưa import sao kê ngân hàng. Tải file CSV/Excel từ internet banking và import vào đây.
          </CardContent>
        </Card>
      )}
    </div>
  )
}
