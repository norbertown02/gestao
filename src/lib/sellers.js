import { useEffect, useState } from 'react'
import { supabaseAdmin } from './supabase'

// Fonte única de verdade pra "quem é vendedor": erp_vendedores é uma view
// (erp_partners com IDN_VENDEDOR='S') -- só existe vendedor que vem do Ultra,
// não pode ter vendedor fantasma criado só no nosso app.
export const CONTA_PADRAO_ULTRA_ID = 4 // Nutrialle Nutrição Animal -- fallback pra venda sem vendedor atribuído

export async function fetchVendedores() {
  // O espelho ERP nao e atualizado na mesma velocidade dos cadastros de
  // vendedores do app. Conciliamos a lista comercial com os perfis ativos.
  // Perfis administrativos ligados a um ID Ultra NAO viram vendedores.
  const [erpResult, profilesResult] = await Promise.all([
    supabaseAdmin.from('erp_vendedores')
      .select('id,name,document,is_conta_padrao')
      .order('is_conta_padrao')
      .order('name'),
    supabaseAdmin.from('profiles')
      .select('id,name,role,active,ultra_salesman_id')
      .eq('active', true),
  ])

  if (erpResult.error) throw erpResult.error
  if (profilesResult.error) throw profilesResult.error

  const profiles = profilesResult.data || []
  const authorizedRoles = new Set(['vendedor', 'gestor_comercial'])
  const linked = profiles.filter(p =>
    p.ultra_salesman_id != null && Number.isFinite(Number(p.ultra_salesman_id))
  )
  const excludedIds = new Set(linked
    .filter(p => !authorizedRoles.has(p.role))
    .map(p => Number(p.ultra_salesman_id)))
  const activeByUltraId = new Map(linked
    .filter(p => authorizedRoles.has(p.role))
    .map(p => [Number(p.ultra_salesman_id), p]))

  const merged = new Map()
  for (const seller of erpResult.data || []) {
    const id = Number(seller.id)
    if (seller.is_conta_padrao || excludedIds.has(id)) continue
    const profile = activeByUltraId.get(id)
    merged.set(id, {
      ...seller,
      id,
      name: profile?.name?.trim() || seller.name,
    })
  }
  // Vendedores novos com vinculo Ultra correto entram antes da sincronizacao
  // do espelho ERP, mesmo que ainda nao tenham pedidos.
  for (const [id, profile] of activeByUltraId) {
    if (!merged.has(id)) merged.set(id, {
      id,
      name: profile.name?.trim() || `Vendedor Ultra #${id}`,
      document: null,
      is_conta_padrao: false,
    })
  }

  return [...merged.values()].sort((a, b) =>
    String(a.name).localeCompare(String(b.name), 'pt-BR'))
}

export function useVendedores() {
  const [vendedores, setVendedores] = useState([])
  const [vendedoresById, setVendedoresById] = useState(new Map())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    fetchVendedores()
      .then(rows => {
        if (!active) return
        setVendedores(rows)
        setVendedoresById(new Map(rows.map(row => [row.id, row])))
        setLoading(false)
      })
      .catch(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [])

  return { vendedores, vendedoresById, loading }
}

// Chave canônica pra agrupar linhas de vendas/pedidos/metas por vendedor --
// prioriza o id do Ultra (sempre que presente) sobre o seller_id do app, já
// que o Ultra é a fonte de verdade.
export function sellerRowKey(row) {
  if (!row) return null
  if (row.ultra_salesman_id) return `ultra:${row.ultra_salesman_id}`
  if (row.seller_id) return row.seller_id
  return null
}

// Nome de exibição pra uma linha vinda de vendas/pedidos/metas -- prioriza o
// nome oficial da lista canônica; só cai pro nome solto que veio na própria
// linha (ultra_salesman_name/salesman_name) quando o id não bate com nenhum
// vendedor canônico (ex.: operador antigo do Ultra que não é vendedor real).
export function sellerRowName(row, vendedoresById) {
  const canonico = row?.ultra_salesman_id ? vendedoresById?.get(row.ultra_salesman_id) : null
  if (canonico) return canonico.name
  return row?.ultra_salesman_name || row?.salesman_name || 'Vendedor não vinculado'
}

// Um profiles.ultra_salesman_id só conta se apontar pra um vendedor real da
// lista canônica -- evita repetir o problema do perfil ligado a um id que
// era, na real, um operador de sistema e não um vendedor.
export function isVendedorValido(ultraSalesmanId, vendedoresById) {
  return !!ultraSalesmanId && vendedoresById?.has(ultraSalesmanId)
}
