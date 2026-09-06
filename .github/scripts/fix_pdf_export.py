from pathlib import Path

p = Path('src/screens/Fechamentos.jsx')
s = p.read_text()

if "const [exportProgress, setExportProgress]" not in s:
    s = s.replace(
        "  const [exporting, setExporting] = useState('')\n",
        "  const [exporting, setExporting] = useState('')\n  const [exportProgress, setExportProgress] = useState(0)\n",
    )

start = s.index("  async function renderSlides() {")
end = s.index("  async function exportPPTX() {")

new_block = '''  const waitForPaint = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  const yieldToBrowser = () => new Promise(resolve => setTimeout(resolve, 0))

  async function captureSlide(node, scale = 1.5) {
    if (!node) throw new Error('Slide indisponível para captura.')
    node.classList.add('capture')
    try {
      await waitForPaint()
      return await html2canvas(node, {
        scale,
        useCORS: true,
        allowTaint: false,
        backgroundColor: '#f7f3ef',
        logging: false,
        imageTimeout: 5000,
        removeContainer: true,
      })
    } finally {
      node.classList.remove('capture')
    }
  }

  async function renderSlides() {
    const images = []
    if (document.fonts?.ready) await document.fonts.ready
    const nodes = slideRefs.current.slice(0, slides.length)
    for (let i = 0; i < nodes.length; i += 1) {
      const canvas = await captureSlide(nodes[i], 1.35)
      images.push(canvas.toDataURL('image/jpeg', 0.9))
      canvas.width = 1
      canvas.height = 1
      setExportProgress(i + 1)
      await yieldToBrowser()
    }
    return images
  }

  async function exportPDF() {
    setExporting('pdf')
    setExportProgress(0)
    try {
      if (document.fonts?.ready) await document.fonts.ready
      await waitForPaint()
      const nodes = slideRefs.current.slice(0, slides.length)
      if (!nodes.length || nodes.some(node => !node)) throw new Error('Os slides ainda não terminaram de renderizar.')

      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [338.667, 190.5], compress: true })
      for (let i = 0; i < nodes.length; i += 1) {
        const canvas = await captureSlide(nodes[i], 1.5)
        const image = canvas.toDataURL('image/jpeg', 0.92)
        if (i) pdf.addPage([338.667, 190.5], 'landscape')
        pdf.addImage(image, 'JPEG', 0, 0, 338.667, 190.5, undefined, 'FAST')
        canvas.width = 1
        canvas.height = 1
        setExportProgress(i + 1)
        await yieldToBrowser()
      }
      pdf.save(`nutrialle-fechamento-${type}-${sanitizeName(period)}.pdf`)
    } catch (error) {
      console.error('Erro ao gerar PDF da apresentação:', error)
      window.alert(`Não foi possível gerar o PDF. ${error?.message || 'Tente novamente.'}`)
    } finally {
      setExportProgress(0)
      setExporting('')
    }
  }

'''

s = s[:start] + new_block + s[end:]

s = s.replace(
    "<IconFileTypePdf size={17} /> {exporting === 'pdf' ? 'Gerando…' : 'Baixar PDF'}",
    "<IconFileTypePdf size={17} /> {exporting === 'pdf' ? `Gerando ${exportProgress}/${slides.length}…` : 'Baixar PDF'}",
)

old_filmstrip = '<section className="closing-filmstrip">{slides.map((slide, i) => <button key={i} className={activeSlide === i ? \'active\' : \'\'} onClick={() => setActiveSlide(i)}><span>{slide}</span><b>{String(i + 1).padStart(2, \'0\')}</b></button>)}</section>'
new_filmstrip = '{!exporting && <section className="closing-filmstrip">{slides.map((slide, i) => <button key={i} className={activeSlide === i ? \'active\' : \'\'} onClick={() => setActiveSlide(i)}><span>{slide}</span><b>{String(i + 1).padStart(2, \'0\')}</b></button>)}</section>}'
s = s.replace(old_filmstrip, new_filmstrip)

p.write_text(s)
