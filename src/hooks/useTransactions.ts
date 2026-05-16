import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Transaction, Category, TransactionType, TransactionStatus } from '@/types'

export function useCategories(companyId: string) {
  return useQuery({
    queryKey: ['categories', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('categories')
        .select('*, accounts(code, name)')
        .eq('company_id', companyId)
        .order('type')
        .order('name')
      if (error) throw error
      return data as (Category & { accounts: { code: string; name: string } | null })[]
    },
  })
}

export function useTransactions(companyId: string, filters?: {
  status?: TransactionStatus
  type?: TransactionType
  dateFrom?: string
  dateTo?: string
  categoryId?: string
}) {
  return useQuery({
    queryKey: ['transactions', companyId, filters],
    queryFn: async () => {
      let q = supabase
        .from('transactions')
        .select('*, categories(name, type), accounts(code, name)')
        .eq('company_id', companyId)

      if (filters?.status) q = q.eq('status', filters.status)
      if (filters?.type) q = q.eq('type', filters.type)
      if (filters?.dateFrom) q = q.gte('date', filters.dateFrom)
      if (filters?.dateTo) q = q.lte('date', filters.dateTo)
      if (filters?.categoryId) q = q.eq('category_id', filters.categoryId)

      const { data, error } = await q.order('date', { ascending: false })
      if (error) throw error
      return data as (Transaction & {
        categories: { name: string; type: string } | null
        accounts: { code: string; name: string } | null
      })[]
    },
  })
}

export function useCreateTransaction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: Omit<Transaction, 'id' | 'created_at'>) => {
      const { error } = await supabase.from('transactions').insert(input)
      if (error) throw error
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['transactions', vars.company_id] })
    },
  })
}

export function useUpdateTransaction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, company_id, ...data }: Partial<Transaction> & { id: string; company_id: string }) => {
      const { error } = await supabase.from('transactions').update(data).eq('id', id)
      if (error) throw error
      return { company_id }
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['transactions', vars.company_id] })
    },
  })
}

export function useDeleteTransaction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, company_id }: { id: string; company_id: string }) => {
      const { error } = await supabase.from('transactions').delete().eq('id', id)
      if (error) throw error
      return { company_id }
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['transactions', vars.company_id] })
    },
  })
}

export function useBulkApproveTransactions() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ ids, company_id }: { ids: string[]; company_id: string }) => {
      const { error } = await supabase
        .from('transactions')
        .update({ status: 'official', needs_review: false })
        .in('id', ids)
      if (error) throw error
      return { company_id }
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['transactions', vars.company_id] })
    },
  })
}
