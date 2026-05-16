import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Document, DocumentRequest, DocumentRequestStatus, DocumentRequestType } from '@/types'

export function useDocumentRequests(companyId: string) {
  return useQuery({
    queryKey: ['doc-requests', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('document_requests')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as DocumentRequest[]
    },
  })
}

export function useDocuments(companyId: string) {
  return useQuery({
    queryKey: ['documents', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as Document[]
    },
  })
}

export function useCreateDocumentRequest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      company_id: string
      title: string
      description?: string
      deadline?: string
      type: DocumentRequestType
    }) => {
      const { error } = await supabase.from('document_requests').insert(input)
      if (error) throw error
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['doc-requests', vars.company_id] })
      qc.invalidateQueries({ queryKey: ['doc-requests', 'all'] })
    },
  })
}

export function useUpdateDocumentRequestStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, company_id, status }: { id: string; company_id: string; status: DocumentRequestStatus }) => {
      const { error } = await supabase.from('document_requests').update({ status }).eq('id', id)
      if (error) throw error
      return { company_id }
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['doc-requests', vars.company_id] })
      qc.invalidateQueries({ queryKey: ['doc-requests', 'all'] })
    },
  })
}

export function useUploadDocument() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      companyId,
      requestId,
      file,
      uploadedBy,
      sharedWithClient = false,
    }: {
      companyId: string
      requestId: string | null
      file: File
      uploadedBy: string
      sharedWithClient?: boolean
    }) => {
      const ext = file.name.split('.').pop()
      const path = `${companyId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

      const { error: storageError } = await supabase.storage
        .from('documents')
        .upload(path, file, { upsert: false })
      if (storageError) throw storageError

      const { error: dbError } = await supabase.from('documents').insert({
        company_id: companyId,
        request_id: requestId,
        name: file.name,
        file_path: path,
        file_type: file.type,
        file_size: file.size,
        uploaded_by: uploadedBy,
        shared_with_client: sharedWithClient,
      })
      if (dbError) throw dbError

      if (requestId) {
        await supabase
          .from('document_requests')
          .update({ status: 'uploaded' })
          .eq('id', requestId)
      }

      return path
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['documents', vars.companyId] })
      qc.invalidateQueries({ queryKey: ['doc-requests', vars.companyId] })
    },
  })
}

export function useGetDocumentUrl() {
  return async (filePath: string) => {
    const { data } = await supabase.storage
      .from('documents')
      .createSignedUrl(filePath, 3600)
    return data?.signedUrl ?? null
  }
}
