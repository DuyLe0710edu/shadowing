import React, { useEffect, useMemo, useState } from 'react'

interface Card { id: string; front: string; back: string }

interface Props { setView: React.Dispatch<React.SetStateAction<'queue' | 'solutions' | 'translation' | 'notecards'>> }

const Notecard: React.FC<Props> = ({ setView }) => {
  const [cards, setCards] = useState<Card[]>([])
  const [loading, setLoading] = useState<boolean>(false)
  const [flipped, setFlipped] = useState<Record<string, boolean>>({})
  const [ttsProgress, setTtsProgress] = useState<Record<string, { side: 'front'|'back'; start: number|null; end: number|null }>>({})
  const [activeId, setActiveId] = useState<string | null>(null)

  const targetLang = useMemo(() => {
    try { return JSON.parse(localStorage.getItem('settings.lang') || '{}').target || 'en' } catch { return 'en' }
  }, [])

  const sourceLang = useMemo(() => {
    try { return JSON.parse(localStorage.getItem('settings.lang') || '{}').source || 'auto' } catch { return 'auto' }
  }, [])

  const loadFromHistory = () => {
    try {
      const raw = localStorage.getItem('translationHistory')
      if (!raw) return []
      const list = JSON.parse(raw)
      return list.slice(0, 30).map((x: any) => ({ originalText: x.originalText, translation: x.translation }))
    } catch { return [] }
  }

  const regenerate = async () => {
    setLoading(true)
    const items = loadFromHistory()
    try {
      const gen = await (window.electronAPI as any).generateNotecards?.({ items, source: sourceLang, target: targetLang, limit: 30 })
      const useCards: Card[] = (gen && (gen as any[]).length) ? (gen as any[]).map((c: any) => ({ id: String(c.id), front: String(c.front), back: String(c.back) })) : items.map((p: any, idx: number) => ({ id: `h_${idx}`, front: p.originalText, back: p.translation }))
      setCards(useCards)
      localStorage.setItem('notecards.latest', JSON.stringify(useCards))
    } catch {
      const useCards = items.map((p: any, idx: number) => ({ id: `h_${idx}`, front: p.originalText, back: p.translation }))
      setCards(useCards)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const off1 = window.electronAPI.onTTSProgress?.((d) => {
      setTtsProgress(prev => ({ ...prev, [d.id]: { ...(prev[d.id] || { side: 'front', start: null, end: null }), start: d.start, end: d.end } }))
    })
    const off2 = window.electronAPI.onTTSDone?.((d) => {
      setActiveId(curr => curr === d.id ? null : curr)
    })
    const off3 = window.electronAPI.onTTSError?.((_d) => {})
    try {
      const cached = localStorage.getItem('notecards.latest')
      if (cached) {
        setCards(JSON.parse(cached))
        return
      }
    } catch {}
    regenerate()
    return () => { off1?.(); off2?.(); off3?.() }
  }, [])

  return (
    <div className="px-4 py-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-white/80 text-sm"> Native flipcards</div>
        <div className="flex items-center gap-2">
          <button onClick={() => setView('translation')} className="bg-white/10 hover:bg-white/20 text-white/70 px-2 py-1 rounded-md text-[11px] leading-none">Back to Translation</button>
          <button onClick={regenerate} className="bg-white/10 hover:bg-white/20 text-white/70 px-2 py-1 rounded-md text-[11px] leading-none">Regenerate</button>
        </div>
      </div>

      {loading && (
        <div className="text-center text-white/60 text-sm">Generating notecards...</div>
      )}

      <div className="grid grid-cols-2 gap-3">
        {cards.map(card => (
          <div key={card.id} className="group w-full h-40 [perspective:1000px]">
            <div className={`relative w-full h-full transition-transform duration-700 [transform-style:preserve-3d] ${flipped[card.id] ? '[transform:rotateY(180deg)]' : ''}`}
                 onClick={() => setFlipped(prev => ({ ...prev, [card.id]: !prev[card.id] }))}>
              <div className="absolute inset-0 rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm flex items-center justify-center p-3 text-center text-white/90 [backface-visibility:hidden] overflow-hidden">
                <div className="w-full h-full absolute inset-0 opacity-10" style={{background:'linear-gradient(120deg,transparent 25%,rgba(255,255,255,0.25) 45%,transparent 65%)', backgroundSize:'200% 100%'}}></div>
                <div className="relative text-sm leading-snug">
                  {activeId === `${card.id}-front` && ttsProgress[`${card.id}-front`] ? (
                    <span>
                      {card.front.slice(0, ttsProgress[`${card.id}-front`].start ?? 0)}
                      <span className="text-yellow-300">{card.front.slice(ttsProgress[`${card.id}-front`].start ?? 0, ttsProgress[`${card.id}-front`].end ?? 0)}</span>
                      {card.front.slice(ttsProgress[`${card.id}-front`].end ?? 0)}
                    </span>
                  ) : (
                    <span>{card.front}</span>
                  )}
                </div>
                <button
                  className={`absolute bottom-2 right-2 p-2 rounded-md transition-colors ${activeId === `${card.id}-front` ? 'bg-white/10' : 'bg-white/5 hover:bg-white/10'} text-white/80`}
                  title="Speak front"
                  onClick={(e) => { e.stopPropagation();
                    if (activeId && activeId !== `${card.id}-front`) window.electronAPI.stopSpeech?.()
                    setActiveId(`${card.id}-front`)
                    window.electronAPI.speakText?.({ id: `${card.id}-front`, text: card.front, lang: sourceLang === 'auto' ? undefined : sourceLang, rate: 0.4 })
                  }}
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 9h3l4-4v14l-4-4H4V9z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/><path d="M15 9a4 4 0 010 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/><path d="M17.5 6.5a7.5 7.5 0 010 11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </button>
              </div>
              <div className="absolute inset-0 rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm flex items-center justify-center p-3 text-center text-white/90 [transform:rotateY(180deg)] [backface-visibility:hidden] overflow-hidden">
                <div className="w-full h-full absolute inset-0 opacity-10" style={{background:'linear-gradient(120deg,transparent 25%,rgba(255,255,255,0.25) 45%,transparent 65%)', backgroundSize:'200% 100%'}}></div>
                <div className="relative text-sm leading-snug">
                  {activeId === `${card.id}-back` && ttsProgress[`${card.id}-back`] ? (
                    <span>
                      {card.back.slice(0, ttsProgress[`${card.id}-back`].start ?? 0)}
                      <span className="text-yellow-300">{card.back.slice(ttsProgress[`${card.id}-back`].start ?? 0, ttsProgress[`${card.id}-back`].end ?? 0)}</span>
                      {card.back.slice(ttsProgress[`${card.id}-back`].end ?? 0)}
                    </span>
                  ) : (
                    <span>{card.back}</span>
                  )}
                </div>
                <button
                  className={`absolute bottom-2 right-2 p-2 rounded-md transition-colors ${activeId === `${card.id}-back` ? 'bg-white/10' : 'bg-white/5 hover:bg-white/10'} text-white/80`}
                  title="Speak back"
                  onClick={(e) => { e.stopPropagation();
                    if (activeId && activeId !== `${card.id}-back`) window.electronAPI.stopSpeech?.()
                    setActiveId(`${card.id}-back`)
                    window.electronAPI.speakText?.({ id: `${card.id}-back`, text: card.back, lang: targetLang, rate: 0.4 })
                  }}
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 9h3l4-4v14l-4-4H4V9z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/><path d="M15 9a4 4 0 010 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/><path d="M17.5 6.5a7.5 7.5 0 010 11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default Notecard


