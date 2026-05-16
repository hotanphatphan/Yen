import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from './useAuth'
import type { Company } from '@/types'
import { DEFAULT_ACCOUNTS } from '@/lib/seeds/defaultAccounts'
import { DEFAULT_CATEGORIES } from '@/lib/seeds/defaultCategories'
import { generateDefaultCompliance } from '@/lib/seeds/defaultCompliance'

export function useCompanies() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['companies', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('companies')
        .select('*')
        .order('name')
      if (error) throw error
      return data as Company[]
    },
    enabled: !!user,
  })
}

export function useCompany(companyId: string | undefined) {
  return useQuery({
    queryKey: ['companies', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('companies')
        .select('*')
        .eq('id', companyId!)
        .single()
      if (error) throw error
      return data as Company
    },
    enabled: !!companyId,
  })
}

interface CreateCompanyInput {
  name: string
  mst: string
  business_type: 'cong_ty' | 'ho_kinh_doanh'
  owner_name?: string
  owner_phone?: string
  owner_email?: string
  address?: string
  notes?: string
  vat_rate: number
}

export function useCreateCompany() {
  const qc = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: async (input: CreateCompanyInput) => {
      const { data: company, error } = await supabase
        .from('companies')
        .insert({ ...input, accountant_id: user!.id })
        .select()
        .single()
      if (error) throw error

      // Seed accounts
      const accountRows = DEFAULT_ACCOUNTS.map(a => ({
        company_id: company.id,
        code: a.code,
        name: a.name,
        type: a.type,
        parent_code: a.parent_code,
        is_system: true,
      }))
      const { data: insertedAccounts } = await supabase.from('accounts').insert(accountRows).select()

      // Seed categories with account_id lookup
      if (insertedAccounts) {
        const accountMap = new Map(insertedAccounts.map((a: { code: string; id: string }) => [a.code, a.id]))
        const categoryRows = DEFAULT_CATEGORIES.map(c => ({
          company_id: company.id,
          name: c.name,
          type: c.type,
          account_id: accountMap.get(c.account_code) ?? null,
        }))
        await supabase.from('categories').insert(categoryRows)
      }

      // Seed compliance items
      const complianceItems = generateDefaultCompliance().map(c => ({
        company_id: company.id,
        type: c.type,
        name: c.name,
        period: c.period,
        due_date: c.due_date,
        status: 'not_started' as const,
      }))
      await supabase.from('compliance_items').insert(complianceItems)

      return company as Company
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['companies'] })
    },
  })
}

export function useUpdateCompany() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...data }: Partial<Company> & { id: string }) => {
      const { error } = await supabase.from('companies').update(data).eq('id', id)
      if (error) throw error
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['companies', vars.id] })
      qc.invalidateQueries({ queryKey: ['companies'] })
    },
  })
}
