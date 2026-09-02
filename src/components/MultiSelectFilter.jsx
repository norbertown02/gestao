import { useEffect, useRef, useState } from 'react'
import { IconChevronDown, IconX } from '@tabler/icons-react'

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

  const selected = new Set(values || [])
  const selectedOptions = options.filter(option => selected.has(option.id))
  const summary = selectedOptions.length === 0
    ? allLabel
    : selectedOptions.length <= 2
      ? selectedOptions.map(option => option.name).join(', ')
      : `${selectedOptions.length} selecionados`

  function toggle(id) {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onChange([...next])
  }

  return (
    <div ref={ref} style={{ position: 'relative', minWidth: 190 }}>
      <span style={{ display: 'block', marginBottom: 6, fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '.045em' }}>{label}</span>
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        style={{
          width: '100%', minHeight: 40, border: '1px solid var(--line)', borderRadius: 10,
          background: 'var(--surface)', color: 'var(--text)', padding: '8px 10px 8px 12px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
          fontFamily: 'inherit', fontSize: 12, cursor: 'pointer', textAlign: 'left'
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{summary}</span>
        <IconChevronDown size={15} style={{ flex: '0 0 auto', transform: open ? 'rotate(180deg)' : 'none' }} />
      </button>

      {open && (
        <div style={{
          position: 'absolute', zIndex: 80, top: 'calc(100% + 6px)', left: 0, minWidth: '100%', width: 260,
          maxHeight: 300, overflowY: 'auto', background: 'var(--surface)', border: '1px solid var(--line)',
          borderRadius: 12, boxShadow: '0 18px 45px rgba(20,18,16,.16)', padding: 8
        }}>
          <button
            type="button"
            onClick={() => onChange([])}
            style={{
              width: '100%', border: 'none', background: 'transparent', padding: '9px 10px', borderRadius: 8,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
              fontFamily: 'inherit', fontSize: 12, fontWeight: 700, cursor: 'pointer', color: 'var(--text)'
            }}
          >
            <span>{allLabel}</span>
            {selected.size > 0 && <IconX size={14} />}
          </button>
          <div style={{ height: 1, background: 'var(--line)', margin: '4px 0' }} />
          {options.map(option => (
            <label key={option.id} style={{
              display: 'flex', alignItems: 'center', gap: 9, padding: '9px 10px', borderRadius: 8,
              cursor: 'pointer', fontSize: 12, color: 'var(--text)'
            }}>
              <input
                type="checkbox"
                checked={selected.has(option.id)}
                onChange={() => toggle(option.id)}
                style={{ accentColor: '#E87722' }}
              />
              <span>{option.name}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}
