import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { ComplianceItem, ComplianceStatus } from '@/types'

export function useComplianceItems(companyId: string | undefined) {
  return useQuery({
    queryKey: ['compliance', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('compliance_items')
        .select('*')
        .eq('company_id', companyId!)
        .order('due_date')
      if (error) throw error
      return data as ComplianceItem[]
    },
    enabled: !!companyId,
  })
}

export function useAllComplianceItems() {
  return useQuery({
    queryKey: ['compliance', 'all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('compliance_items')
        .select('*, companies(name)')
        .order('due_date')
      if (error) throw error
      return data as (ComplianceItem & { companies: { name: string } })[]
    },
  })
}

export function useCreateComplianceItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: Omit<ComplianceItem, 'id' | 'created_at'>) => {
      const { error } = await supabase.from('compliance_items').insert(input)
      if (error) throw error
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['compliance', vars.company_id] })
      qc.invalidateQueries({ queryKey: ['compliance', 'all'] })
    },
  })
}

export function useUpdateComplianceStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, company_id, status }: { id: string; company_id: string; status: ComplianceStatus }) => {
      const { error } = await supabase.from('compliance_items').update({ status }).eq('id', id)
      if (error) throw error
      return { company_id }
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['compliance', vars.company_id] })
      qc.invalidateQueries({ queryKey: ['compliance', 'all'] })
    },
  })
}

export function useDeleteComplianceItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, company_id }: { id: string; company_id: string }) => {
      const { error } = await supabase.from('compliance_items').delete().eq('id', id)
      if (error) throw error
      return { company_id }
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['compliance', vars.company_id] })
      qc.invalidateQueries({ queryKey: ['compliance', 'all'] })
    },
  })
}
