// Composants SVG décoratifs réutilisables pour la série XV2
// Server Component — pas de 'use client' nécessaire

interface SvgProps {
  size?: number
  color?: string
  className?: string
}

/** Croix ✕ diagonale, marque de la série XV2 */
export function Xv2Cross({ size = 24, color = '#f06ad8', className }: SvgProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <line x1="3" y1="3" x2="21" y2="21" stroke={color} strokeWidth="3" strokeLinecap="round" />
      <line x1="21" y1="3" x2="3" y2="21" stroke={color} strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

/** Losange allongé décoratif */
export function Xv2Shard({ size = 24, color = '#8fc6f5', className }: SvgProps) {
  return (
    <svg
      width={size}
      height={size * 1.8}
      viewBox="0 0 24 44"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path
        d="M12 2 L22 22 L12 42 L2 22 Z"
        fill={color}
        fillOpacity="0.7"
      />
      <path
        d="M12 6 L19 22 L12 38 L5 22 Z"
        fill={color}
        fillOpacity="0.3"
      />
    </svg>
  )
}

/** Badge "X" de la série XV2 — hexagone avec X rose/bleu */
export function Xv2Logo({ size = 48, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      aria-label="Logo XV2"
      className={className}
    >
      {/* Hexagone fond */}
      <path
        d="M50 4 L92 27 L92 73 L50 96 L8 73 L8 27 Z"
        fill="#1c3a6e"
        stroke="#2f6fde"
        strokeWidth="2"
      />
      {/* X rose/bleu — deux barres diagonales dégradées */}
      <line x1="28" y1="28" x2="72" y2="72" stroke="#f06ad8" strokeWidth="10" strokeLinecap="round" />
      <line x1="72" y1="28" x2="28" y2="72" stroke="#8fc6f5" strokeWidth="10" strokeLinecap="round" />
      {/* Croisement central — pastille pour superposition */}
      <circle cx="50" cy="50" r="6" fill="#e87fd4" />
      {/* Contour fin extérieur */}
      <path
        d="M50 4 L92 27 L92 73 L50 96 L8 73 L8 27 Z"
        fill="none"
        stroke="rgba(240,106,216,0.4)"
        strokeWidth="1"
      />
    </svg>
  )
}
