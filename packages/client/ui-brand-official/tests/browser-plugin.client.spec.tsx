// @vitest-environment jsdom
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { apply, inject } from '../src/client/index.ts'
import { BrandMark, BrandName } from '../src/client/Brand.tsx'
import { apply as hostApply } from '../src/index.ts'

afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
  for (const tag of document.head.querySelectorAll('style[data-plugin-css$="/alphadesk-theme.css"]')) tag.remove()
})

const HOLES = [
  'sidebar.brand.mark',
  'sidebar.brand.name',
] as const

const HERO_HOLE = 'conversation.hero.brand.mark'

async function bench(declare = true) {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const slots = ctx.get('slots') as SlotRegistry
  const declareHoles = () => slots.register({
    name: 'root',
    children: Object.fromEntries([...HOLES, HERO_HOLE].map(name => [name, { kind: 'single', scope: 'root' }])),
  } as never, () => null)
  const disposeHoles = declare ? declareHoles() : undefined
  return { ctx, slots, declareHoles, disposeHoles }
}

describe('official browser-brand plugin', () => {
  it('keeps the host Loader entry inert', () => {
    expect(hostApply).not.toThrow()
  })

  it('declares only the slot service it uses', () => {
    expect(inject).toEqual(['slots'])
  })

  it('registers the AlphaDesk brand in every build profile', async () => {
    for (const profile of ['official', 'local', undefined]) {
      vi.stubEnv('DSH_CLIENT_BUILD_PROFILE', profile as string)
      const subject = await bench()
      await subject.ctx.plugin({ inject: [...inject], apply }).await()
      for (const hole of HOLES) expect(subject.slots.entries(hole)).toHaveLength(1)
      expect(subject.slots.entries(HERO_HOLE)).toHaveLength(1)
    }
  })

  it('fills declarations before or after apply and removes every occupant on teardown', async () => {
    vi.stubEnv('DSH_CLIENT_BUILD_PROFILE', 'official')
    const before = await bench()
    const fiber = before.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    for (const hole of HOLES) expect(before.slots.entries(hole)).toHaveLength(1)

    before.disposeHoles?.()
    for (const hole of HOLES) expect(before.slots.entries(hole)).toHaveLength(0)
    before.declareHoles()
    await Promise.resolve()
    for (const hole of HOLES) expect(before.slots.entries(hole)).toHaveLength(1)

    await fiber.dispose()
    for (const hole of HOLES) expect(before.slots.entries(hole)).toHaveLength(0)

    const after = await bench(false)
    await after.ctx.plugin({ inject: [...inject], apply }).await()
    for (const hole of HOLES) expect(after.slots.entries(hole)).toHaveLength(0)
    after.declareHoles()
    await Promise.resolve()
    for (const hole of HOLES) expect(after.slots.entries(hole)).toHaveLength(1)
  })

  it('fills the conversation hero mark alongside the sidebar slots', async () => {
    vi.stubEnv('DSH_CLIENT_BUILD_PROFILE', 'official')
    const subject = await bench()
    await subject.ctx.plugin({ inject: [...inject], apply }).await()
    expect(subject.slots.entries(HERO_HOLE)).toHaveLength(1)
  })

  it('renders the AlphaDesk name independently from both requested mark sizes', () => {
    const name = render(<BrandName />)
    expect(name.container.textContent).toBe('AlphaDesk')
    name.unmount()

    const mark = render(<BrandMark size={34} />)
    expect(mark.container.querySelector('svg')?.getAttribute('width')).toBe('34')
    mark.rerender(<BrandMark size={24} />)
    expect(mark.container.querySelector('svg')?.getAttribute('width')).toBe('24')
  })

  it('mounts and removes the palette stylesheet with the plugin lifetime', async () => {
    vi.stubEnv('DSH_CLIENT_BUILD_PROFILE', 'official')
    const subject = await bench()
    const fiber = subject.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    const selector = 'style[data-plugin-css$="/alphadesk-theme.css"]'
    expect(document.head.querySelector(selector)?.getAttribute('data-plugin')).toBe('@deepseek-ai/dsh-client-ui-brand-official')

    await fiber.dispose()
    expect(document.head.querySelector(selector)).toBeNull()
  })

  it('ships the AlphaDesk navy scale and accent in the palette sheet', () => {
    const css = readFileSync(join(process.cwd(), 'packages/client/ui-brand-official/src/styles/alphadesk-theme.css'), 'utf8')
    expect(css).toContain('--dsh-brand-accent: rgb(164, 128, 56)')
    expect(css).toContain('--dsw-static-deepseek-500: rgb(23, 64, 113)')
    expect(css).toContain('body[data-ds-dark-theme]')
    expect(css).toContain('--dsh-brand-accent: rgb(196, 165, 94)')
    expect(css).toContain('--dsw-font-family-brand: var(--dsh-font-family-text')
  })
})
