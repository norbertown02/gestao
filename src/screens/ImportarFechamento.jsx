import { useEffect, useMemo, useRef, useState } from 'react'
import {
  IconAlertTriangle, IconCalendar, IconCheck, IconCloudUpload, IconFileSpreadsheet,
  IconHistory, IconLoader2, IconMapPin, IconRefresh, IconTrash, IconX,
} from '@tabler/icons-react'
import Topbar from '../components/Topbar'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/useAuth'
import './ImportarFechamento.css'

const REPORTS = [
  { key: 'dre', number: '01', title: 'DRE Comparativo', note: 'Resultado, margens e contas detalhadas', ultraPath: ['Demonstrativo', 'DRE Demonstrativo de Resultado'], required: true },
  { key: 'gerencial', number: '02', title: 'Relatório Gerencial', note: 'Margem bruta, estoque, prazos e caixa', ultraPath: ['Demonstrativo', 'Relatório Gerencial'], required: true },
  { key: 'balanco', number: '03', title: 'Balanço Financeiro', note: 'Ativos, passivos, liquidez e capital de giro', ultraPath: ['Demonstrativo', 'Balanço Financeiro'], required: true },
  { key: 'balancete', number: '04', title: 'Balancete', note: 'Saldos, débitos, créditos e conciliações', ultraPath: ['Demonstrativo', 'Balancete de Receitas e Despesas'], required: true },
  { key: 'contas_pagar', number: '05', title: 'Contas a Pagar', note: 'Previsão financeira e vencimentos futuros', ultraPath: ['Contas a pagar', 'Relatório/Resumos', 'Previsão financeira de Contas a Pagar'], required: true },
  { key: 'contas_receber', number: '06', title: 'Contas a Receber', note: 'Títulos, vencimentos e inadimplência', ultraPath: ['Contas a receber', 'Relatório/Resumos', 'Previsão financeira de Contas a Receber'], required: true },
]
const ACCEPT = '.xlsx,.xls,.csv,.pdf'
const MAX_SIZE = 20 * 1024 * 1024
const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

const safeName = name => String(name).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-')
const competenceIso = (year, month) => `${year}-${String(month).padStart(2, '0')}-01`
const fileSize = bytes => bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`

export default function ImportarFechamento() {
  const now = new Date()
  const { user } = useAuth()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [files, setFiles] = useState({})
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [dragging, setDragging] = useState('')
  const [message, setMessage] = useState(null)
  const inputs = useRef({})

  async function loadHistory() {
    setLoading(true)
    const { data, error } = await supabase.from('finance_import_batches').select('*, finance_import_files(*)').order('competencia_date', { ascending: false }).limit(18)
    if (error) setMessage({ type: 'error', text: error.message })
    else setHistory(data || [])
    setLoading(false)
  }
  useEffect(() => {
    let active = true
    supabase.from('finance_import_batches').select('*, finance_import_files(*)').order('competencia_date', { ascending: false }).limit(18).then(({ data, error }) => {
      if (!active) return
      if (error) setMessage({ type: 'error', text: error.message })
      else setHistory(data || [])
      setLoading(false)
    })
    return () => { active = false }
  }, [])

  const competence = competenceIso(year, month)
  const currentBatch = history.find(item => item.competencia_date === competence)
  const stored = useMemo(() => Object.fromEntries((currentBatch?.finance_import_files || []).map(file => [file.report_type, file])), [currentBatch])
  const completeCount = REPORTS.filter(report => files[report.key] || stored[report.key]).length
  const progress = completeCount / REPORTS.length * 100

  function chooseFile(type, file) {
    setMessage(null)
    if (!file) return
    const extensionOk = /\.(xlsx|xls|csv|pdf)$/i.test(file.name)
    if (!extensionOk) return setMessage({ type: 'error', text: 'Use arquivos XLSX, XLS, CSV ou PDF.' })
    if (file.size > MAX_SIZE) return setMessage({ type: 'error', text: `${file.name} ultrapassa o limite de 20 MB.` })
    setFiles(current => ({ ...current, [type]: file }))
  }

  async function submit() {
    const pending = Object.entries(files)
    if (!pending.length) return setMessage({ type: 'error', text: 'Selecione pelo menos um relatório para enviar.' })
    setUploading(true)
    setMessage(null)
    try {
      const { data: batch, error: batchError } = await supabase.from('finance_import_batches').upsert({ competencia_date: competence, status: 'rascunho', created_by: user?.id, updated_at: new Date().toISOString() }, { onConflict: 'competencia_date' }).select().single()
      if (batchError) throw batchError

      for (const [type, file] of pending) {
        const old = stored[type]
        const path = `${year}/${String(month).padStart(2, '0')}/${type}/${Date.now()}-${safeName(file.name)}`
        const { error: uploadError } = await supabase.storage.from('finance-reports').upload(path, file, { contentType: file.type || undefined, upsert: false })
        if (uploadError) throw uploadError
        const { error: fileError } = await supabase.from('finance_import_files').upsert({ batch_id: batch.id, report_type: type, file_name: file.name, storage_path: path, file_size: file.size, mime_type: file.type, status: 'recebido', validation_message: 'Arquivo recebido; aguardando processamento.', uploaded_by: user?.id }, { onConflict: 'batch_id,report_type' })
        if (fileError) { await supabase.storage.from('finance-reports').remove([path]); throw fileError }
        if (old?.storage_path && old.storage_path !== path) await supabase.storage.from('finance-reports').remove([old.storage_path])
      }

      const finalCount = new Set([...(currentBatch?.finance_import_files || []).map(item => item.report_type), ...pending.map(([type]) => type)]).size
      const { error: updateError } = await supabase.from('finance_import_batches').update({ status: finalCount === REPORTS.length ? 'recebido' : 'rascunho', submitted_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', batch.id)
      if (updateError) throw updateError
      setFiles({})
      setMessage({ type: 'success', text: `${pending.length} ${pending.length === 1 ? 'arquivo enviado' : 'arquivos enviados'} para ${MONTHS[month - 1]} de ${year}.` })
      await loadHistory()
    } catch (error) {
      setMessage({ type: 'error', text: error.message || 'Não foi possível enviar o pacote.' })
    } finally {
      setUploading(false)
    }
  }

  function clearLocal(type) { setFiles(current => { const next = { ...current }; delete next[type]; return next }) }

  return <div className="import-shell">
    <Topbar title="Importar fechamento" subtitle="Arquive e organize os relatórios mensais do Financeiro" />
    <main className="import-page">
      <section className="import-hero">
        <div><span>CENTRAL DE FECHAMENTO</span><h1>Uma competência, um pacote completo.</h1><p>Selecione o mês e coloque cada relatório em seu lugar. Os arquivos ficam preservados para conferência, histórico e processamento financeiro.</p></div>
        <div className="import-period"><IconCalendar size={19}/><label><span>Competência</span><div><select value={month} onChange={event => { setMonth(Number(event.target.value)); setFiles({}); setMessage(null) }}>{MONTHS.map((name, index) => <option value={index + 1} key={name}>{name}</option>)}</select><select value={year} onChange={event => { setYear(Number(event.target.value)); setFiles({}); setMessage(null) }}>{[year - 1, year, year + 1].map(value => <option key={value}>{value}</option>)}</select></div></label></div>
      </section>

      <section className="import-progress"><div><span>COMPLETUDE DO PACOTE</span><strong>{completeCount} de {REPORTS.length} relatórios</strong></div><i><em style={{ width: `${progress}%` }}/></i><b>{Math.round(progress)}%</b></section>
      {message && <div className={`import-message ${message.type}`}>{message.type === 'success' ? <IconCheck size={18}/> : <IconAlertTriangle size={18}/>}<span>{message.text}</span><button onClick={() => setMessage(null)}><IconX size={16}/></button></div>}

      <section className="import-grid">{REPORTS.map(report => {
        const local = files[report.key]
        const saved = stored[report.key]
        const ready = local || saved
        return <article key={report.key} className={`import-card ${ready ? 'ready' : ''} ${dragging === report.key ? 'dragging' : ''}`} onDragOver={event => { event.preventDefault(); setDragging(report.key) }} onDragLeave={() => setDragging('')} onDrop={event => { event.preventDefault(); setDragging(''); chooseFile(report.key, event.dataTransfer.files[0]) }}>
          <header><b>{report.number}</b><div><h3>{report.title}</h3><p>{report.note}</p></div>{ready && <IconCheck className="import-check" size={21}/>}</header>
          <div className="import-ultra-path"><IconMapPin size={14}/><div><span>CAMINHO NO ULTRA</span><p>{report.ultraPath.map((step, index) => <span key={step}>{index > 0 && <i>›</i>}{step}</span>)}</p></div></div>
          <button className="import-drop" onClick={() => inputs.current[report.key]?.click()}><IconFileSpreadsheet size={24}/>{local ? <><strong>{local.name}</strong><small>{fileSize(local.size)} · pronto para enviar</small></> : saved ? <><strong>{saved.file_name}</strong><small>{fileSize(saved.file_size)} · arquivo armazenado</small></> : <><strong>Selecionar ou arrastar arquivo</strong><small>XLSX, XLS, CSV ou PDF · até 20 MB</small></>}</button>
          <input ref={node => { inputs.current[report.key] = node }} type="file" accept={ACCEPT} hidden onChange={event => chooseFile(report.key, event.target.files?.[0])}/>
          <footer><span>{report.required ? 'Obrigatório' : 'Opcional'}</span>{local && <button onClick={() => clearLocal(report.key)}><IconTrash size={15}/> Remover</button>}{saved && !local && <button onClick={() => inputs.current[report.key]?.click()}><IconRefresh size={15}/> Substituir</button>}</footer>
        </article>
      })}</section>

      <section className="import-submit"><div><IconCloudUpload size={23}/><div><strong>{Object.keys(files).length ? `${Object.keys(files).length} ${Object.keys(files).length === 1 ? 'arquivo preparado' : 'arquivos preparados'}` : 'Nenhum arquivo novo selecionado'}</strong><span>Os arquivos enviados serão associados a {MONTHS[month - 1]} de {year}.</span></div></div><button className="btn btn-primary" disabled={uploading || !Object.keys(files).length} onClick={submit}>{uploading ? <><IconLoader2 className="spin" size={18}/> Enviando pacote…</> : <><IconCloudUpload size={18}/> Enviar relatórios</>}</button></section>

      <section className="import-history"><header><div><IconHistory size={20}/><div><span>HISTÓRICO</span><h2>Fechamentos recebidos</h2></div></div><button onClick={loadHistory}><IconRefresh size={16}/> Atualizar</button></header>{loading ? <div className="import-empty"><IconLoader2 className="spin"/> Carregando histórico…</div> : history.length ? <div className="import-history-list">{history.map(batch => { const count = batch.finance_import_files?.length || 0; return <div key={batch.id}><time>{MONTHS[Number(batch.competencia_date.slice(5, 7)) - 1]} <b>{batch.competencia_date.slice(0, 4)}</b></time><span><i className={count === REPORTS.length ? 'complete' : ''}/>{count === REPORTS.length ? 'Pacote completo' : `${count} de ${REPORTS.length} relatórios`}</span><small>Atualizado em {new Date(batch.updated_at).toLocaleDateString('pt-BR')}</small></div> })}</div> : <div className="import-empty">Nenhum pacote enviado por esta central ainda.</div>}</section>
    </main>
  </div>
}
