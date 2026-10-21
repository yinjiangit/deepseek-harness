/** AlphaDesk occupants for the generic browser-brand slots. */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { BrandMark, BrandName, HeroMark } from './Brand.tsx'
import { installBrandTheme } from './theme.ts'

/** Required service: the UI slot registry. */
export const inject = ['slots']

/**
 * Mount the AlphaDesk palette, then fill the sidebar and conversation-hero
 * brand slots as one declaration-aware registration set: the set installs
 * whether a declarer activates before or after this row, and withdraws every
 * occupant when any declaration collapses, leaving no partial brand mix.
 *
 * Fork deviation: every client build profile registers the AlphaDesk brand.
 * Upstream gates this on `DSH_CLIENT_BUILD_PROFILE === 'official'`, leaving
 * source-launched dev builds on the fish mark; AlphaDesk treats those falls as
 * brand leakage, so the gate is intentionally absent here.
 * @param ctx - Client root context.
 */
export function apply(ctx: ClientContext): void {
  installBrandTheme(ctx)
  ctx.slots.inject('sidebar.brand.mark', () =>
    ctx.slots.inject('sidebar.brand.name', () =>
      ctx.slots.inject('conversation.hero.brand.mark', function* () {
        yield ctx.slots.register({ name: 'sidebar.brand.mark' }, BrandMark)
        yield ctx.slots.register({ name: 'sidebar.brand.name' }, BrandName)
        yield ctx.slots.register({ name: 'conversation.hero.brand.mark' }, HeroMark)
      })))
}
