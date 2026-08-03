import { useEffect, useState } from 'react'
import { supabaseAdmin } from './supabase'

// Fonte única de verdade pra "quem é vendedor": erp_vendedores é uma view
// (erp_partners com IDN_VENDEDOR='S') -- só existe vendedor que vem do Ultra,
// não pode ter vendedor fantasma criado só no nosso app.
export const CONTA_PADRAO_ULTRA_ID = 4 // Nutrialle Nutrição Animal -- fallback pra venda sem vendedor atribuído

export async function fetchVendedores() {
  const { data, error } = await supabaseAdmin
    .from('erp_vendedores')
    .select('id,name,document,is_conta_padrao')
    .order('is_conta_padrao')
    .order('name')

  if (error) throw error
  return data || []
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
