import type { HeroBrandMarkOwnerProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { SidebarBrandMarkOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'

/** Native viewBox of the AlphaDesk mark (width and height in user units). */
const ALPHA_MARK_VIEWBOX = { width: 48, height: 48 } as const

/** The two mitered legs of the capital-A skeleton. */
const ALPHA_MARK_LEGS = 'M12 40 L22.5 8 L33 40'

/** The crossbar, extended past the right leg: excess return above the trend. */
const ALPHA_MARK_BAR = 'M16.3 29.5 H36'

/** Stroke weight of both mark paths. */
const ALPHA_MARK_STROKE_WIDTH = 4.8

/**
 * Render the AlphaDesk mark skeleton once for every brand surface.
 * @param props - square edge, host class, and optional crossbar color.
 * @returns the mark svg, aria-hidden so the adjacent name carries the accessible label.
 */
function AlphaMarkSvg({ size, className, barColor = 'var(--dsh-brand-accent)' }: {
  size: number
  className?: string | undefined
  barColor?: string | undefined
}) {
  return (
    <svg
      width={size}
      height={size}
      className={className}
      viewBox={`0 0 ${ALPHA_MARK_VIEWBOX.width} ${ALPHA_MARK_VIEWBOX.height}`}
      fill="none"
      aria-hidden="true"
    >
      <path d={ALPHA_MARK_LEGS} stroke="currentColor" strokeWidth={ALPHA_MARK_STROKE_WIDTH} />
      <path d={ALPHA_MARK_BAR} stroke={barColor} strokeWidth={ALPHA_MARK_STROKE_WIDTH} />
    </svg>
  )
}

/**
 * Render the AlphaDesk mark with the presentation requested by the sidebar.
 * @param props - requested square edge in pixels.
 * @returns the AlphaDesk mark.
 */
export function BrandMark({ size }: SidebarBrandMarkOwnerProps) {
  return <AlphaMarkSvg size={size} />
}

/**
 * Render the AlphaDesk name without its independently slotted mark.
 * @returns the AlphaDesk wordmark text.
 */
export function BrandName() {
  return <span>AlphaDesk</span>
}

/**
 * Render the blank-session hero mark at the requested square edge.
 * @param props - requested square edge and the host class preserving the surrounding mark geometry.
 * @returns the AlphaDesk hero mark.
 */
export function HeroMark({ size, className }: HeroBrandMarkOwnerProps) {
  return <AlphaMarkSvg size={size} className={className} />
}
