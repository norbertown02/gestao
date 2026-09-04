import { useEffect, useRef, useState } from 'react'
import { IconCheck, IconChevronDown, IconX } from '@tabler/icons-react'

export default function MultiSelectFilter({ label, options = [], values = [], onChange, allLabel = 'Todos' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function outside(event) {
      if (ref.current && !ref.current.contains(event.target)) setOpen(false)
    }
    document.addEventListener('mousedown', outside)
    return () => document.removeEventListener('mousedown', outside)
  }, [])

  const normalizedLabel = String(label || '').trim().toLowerCase()
  if (normalizedLabel === 'aplicação' || normalizedLabel === 'aplicacao' || normalizedLabel === 'categoria') return null

  const selected = new Set(values || [])
  const selectedOptions = options.filter(option => selected.has(option.id))
  const allSelected = options.length > 0 && selectedOptions.length === options.length
  const summary = selectedOptions.length === 0 || allSelected
    ? allLabel
    : selectedOptions.length === 1
      ? selectedOptions[0].name
      : `${selectedOptions.length} selecionados`

  function toggle(id) {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    if (options.length > 0 && next.size === options.length) onChange([])
    else onChange([...next])
  }

  return (
    <div ref={ref} style={{ position: 'relative', width: 190, flex: '0 0 190px' }}>
      <span style={{ display: 'block', marginBottom: 6, fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '.045em' }}>{label}</span>
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        style={{
          width: 190, height: 40, border: '1px solid var(--line)', borderRadius: 10,
          background: 'var(--surface)', color: 'var(--text)', padding: '0 10px 0 12px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
          fontFamily: 'inherit', fontSize: 12, fontWeight: 600, cursor: 'pointer', textAlign: 'left',
          boxSizing: 'border-box'
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{summary}</span>
        <IconChevronDown size={14} style={{ flex: '0 0 auto', transform: open ? 'rotate(180deg)' : 'none' }} />
      </button>

      {open && (
        <div style={{
          position: 'absolute', zIndex: 120, top: 66, left: 0, width: 220,
          maxHeight: 230, overflowY: 'auto', overflowX: 'hidden', background: 'var(--surface)',
          border: '1px solid var(--line)', borderRadius: 10,
          boxShadow: '0 12px 28px rgba(20,18,16,.14)', padding: 6,
          boxSizing: 'border-box'
        }}>
          <button
            type="button"
            onClick={() => onChange([])}
            style={{
              width: '100%', height: 34, border: 'none', background: 'transparent', padding: '0 8px', borderRadius: 7,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
              fontFamily: 'inherit', fontSize: 12, fontWeight: 700, cursor: 'pointer', color: 'var(--text)',
              boxSizing: 'border-box'
            }}
          >
            <span>{allLabel}</span>
            {selected.size > 0 && !allSelected && <IconX size={13} />}
          </button>

          <div style={{ height: 1, background: 'var(--line)', margin: '4px 0' }} />

          {options.map(option => {
            const checked = selected.has(option.id)
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => toggle(option.id)}
                style={{
                  width: '100%', minHeight: 34, border: 'none', background: checked ? 'var(--surface-2)' : 'transparent',
                  padding: '6px 8px', borderRadius: 7, display: 'flex', alignItems: 'center', gap: 8,
                  cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, color: 'var(--text)', textAlign: 'left',
                  boxSizing: 'border-box'
                }}
              >
                <span style={{
                  width: 15, height: 15, flex: '0 0 15px', borderRadius: 4,
                  border: checked ? '1px solid #E87722' : '1px solid var(--line)',
                  background: checked ? '#E87722' : 'var(--surface)', display: 'grid', placeItems: 'center'
                }}>
                  {checked && <IconCheck size={11} color="#fff" stroke={3} />}
                </span>
                <span style={{ lineHeight: 1.25 }}>{option.name}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
