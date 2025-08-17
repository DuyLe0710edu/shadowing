import React from 'react'

interface Props {
  text: string
  start: number | null
  end: number | null
}

const TTSHighlightedText: React.FC<Props> = ({ text, start, end }) => {
  if (start === null || end === null || start === end) {
    return <span>{text}</span>
  }
  const s = Math.max(0, Math.min(start!, text.length))
  const e = Math.max(0, Math.min(end!, text.length))
  const pre = text.slice(0, s)
  const mid = text.slice(s, e)
  const suf = text.slice(e)
  return (
    <span>
      <span>{pre}</span>
      <span className="text-yellow-300">{mid}</span>
      <span>{suf}</span>
    </span>
  )
}

export default TTSHighlightedText


