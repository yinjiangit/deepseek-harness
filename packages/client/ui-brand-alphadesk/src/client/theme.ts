import type { Context } from '@deepseek-ai/cordis'
import palette from '../styles/alphadesk-theme.css?inline'

const PLUGIN_ID = '@deepseek-ai/dsh-client-ui-brand-alphadesk'

/**
 * Mount the AlphaDesk palette sheet for exactly the owning plugin lifetime.
 * The sheet loads after ui-theme's design platform (a later roster row appends
 * a later style tag), so its equal-specificity `body` rules retarget the
 * static brand scale every alias reads.
 * @param ctx - Owning plugin context.
 */
export function installBrandTheme(ctx: Context): void {
  if (typeof document === 'undefined') return
  ctx.effect(() => {
    const tag = document.createElement('style')
    tag.dataset.plugin = PLUGIN_ID
    tag.dataset.pluginCss = `${PLUGIN_ID}/alphadesk-theme.css`
    tag.textContent = palette
    document.head.appendChild(tag)
    return () => { tag.remove() }
  }, 'ui-brand-alphadesk: palette stylesheet')
}
