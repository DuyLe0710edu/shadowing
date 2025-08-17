import React from 'react'

interface Props {
  className?: string
}

// Transparent-looking white speaker icon using strokes
const SpeakerIcon: React.FC<Props> = ({ className }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <path d="M4 9h3l4-4v14l-4-4H4V9z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M15 9a4 4 0 010 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M17.5 6.5a7.5 7.5 0 010 11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

export default SpeakerIcon


