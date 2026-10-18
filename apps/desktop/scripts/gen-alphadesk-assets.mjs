/**
 * AlphaDesk fork asset generator: renders the AlphaDesk navy tile, platform
 * icons, installer brand art, and the welcome wordmark from one geometry
 * source with sharp. Outputs are committed; rerun after changing the geometry
 * (registered in the repository FORK.md).
 */
import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve as resolvePath, dirname } from 'node:path'
import sharp from 'sharp'

const here = dirname(fileURLToPath(import.meta.url))
const R = rel => resolvePath(here, '../../..', 'apps/desktop', rel)

/** AlphaDesk mark in a 1024-unit space: A skeleton legs plus an extended gold crossbar. */
const MARK_LEGS = 'M296 736 L512 288 L728 736'
const MARK_BAR = 'M382 584 L740 584'
const STROKE = 86
const GOLD = '#C4A55E'
const NAVY_LIGHT = '#1C4E8A'
const NAVY_DARK = '#0F2A4B'

/** Render the mark centered at (cx, cy) scaled from the 1024-unit source space. */
function mark(scale, cx, cy, stroke) {
  return [
    `  <g transform="translate(${cx} ${cy}) scale(${scale}) translate(-512 -512)" fill="none">`,
    `    <path d="${MARK_LEGS}" stroke="${stroke}" stroke-width="${STROKE}"/>`,
    `    <path d="${MARK_BAR}" stroke="${GOLD}" stroke-width="${STROKE}"/>`,
    `  </g>`,
  ].join('\n')
}

const GRADIENT_DEFS = `<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${NAVY_LIGHT}"/>
    <stop offset="1" stop-color="${NAVY_DARK}"/>
  </linearGradient>
</defs>`

/** Application tile with the mark; the tray-glyph group feeds render-tray-icon.ts. */
function tileSvg() {
  return `<svg width="1024" height="1024" viewBox="0 0 1024 1024" fill="none" xmlns="http://www.w3.org/2000/svg">
${GRADIENT_DEFS}
<rect rx="192" width="1024" height="1024" fill="url(#bg)"/>
<g id="tray-glyph">
${mark(0.62, 512, 512, '#FFFFFF')}
</g>
</svg>`
}

/** macOS tile keeps margins around the rounded square, per platform convention. */
function macosSvg() {
  return `<svg width="1024" height="1024" viewBox="0 0 1024 1024" fill="none" xmlns="http://www.w3.org/2000/svg">
${GRADIENT_DEFS}
<g transform="translate(512 512) scale(0.84) translate(-512 -512)">
  <rect rx="230" width="1024" height="1024" fill="url(#bg)"/>
${mark(0.62, 512, 512, '#FFFFFF')}
</g>
</svg>`
}

/** Installer header lockup: mark plus the desk name. */
function wordmarkSvg(labelFill, markStroke) {
  return `<svg width="600" height="196" viewBox="0 0 600 196" fill="none" xmlns="http://www.w3.org/2000/svg">
${mark(0.24, 85, 98, markStroke)}
<text x="170" y="128" font-family="'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif" font-size="84" font-weight="600" letter-spacing="1" fill="${labelFill}">AlphaDesk</text>
</svg>`
}

/** Uninstaller sidebar: full-bleed navy panel with the centered mark. */
function uninstallerSvg() {
  return `<svg width="164" height="314" viewBox="0 0 164 314" fill="none" xmlns="http://www.w3.org/2000/svg">
${GRADIENT_DEFS}
<rect width="164" height="314" fill="url(#bg)"/>
${mark(0.13, 82, 157, '#FFFFFF')}
</svg>`
}

/** Welcome wordmark, self-contained: scheme-swapped label color like the upstream art. */
function welcomeSvg() {
  return `<svg width="472" height="40" viewBox="0 0 472 40" fill="none" xmlns="http://www.w3.org/2000/svg">
<style>
  :root {
    --dsw-alias-label-primary: #0f1115;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --dsw-alias-label-primary: #f9fafb;
    }
  }
</style>
${mark(0.041, 22, 20, 'var(--dsw-alias-label-primary)')}
<text x="44" y="30" font-family="var(--dsw-font-family-brand, -apple-system, 'Segoe UI', sans-serif)" font-size="29" font-weight="600" letter-spacing="0.5" fill="var(--dsw-alias-label-primary)">AlphaDesk</text>
</svg>`
}

await writeFile(R('resources/icon-windows.svg'), tileSvg())
await writeFile(R('resources/icon-macos.svg'), macosSvg())
await writeFile(R('resources/icon.svg'), tileSvg())
await writeFile(R('renderer/assets/welcome-brand.svg'), welcomeSvg())
await sharp(Buffer.from(tileSvg())).png().toFile(R('resources/icon-windows.png'))
await sharp(Buffer.from(macosSvg())).png().toFile(R('resources/icon-macos.png'))
await sharp(Buffer.from(tileSvg())).resize(1104, 1104).png().toFile(R('resources/icon.png'))
await sharp(Buffer.from(wordmarkSvg('#0f1115', '#174071'))).png().toFile(R('installer/assets/brand.png'))
await sharp(Buffer.from(wordmarkSvg('#0f1115', '#174071'))).resize(1200, 392).png().toFile(R('installer/assets/brand-2x.png'))
await sharp(Buffer.from(wordmarkSvg('#ffffff', '#9CB4D8'))).png().toFile(R('installer/assets/brand-dark.png'))
await sharp(Buffer.from(wordmarkSvg('#ffffff', '#9CB4D8'))).resize(1200, 392).png().toFile(R('installer/assets/brand-dark-2x.png'))
await sharp(Buffer.from(uninstallerSvg())).png().toFile(R('installer/assets/uninstaller-sidebar.png'))
console.log('alphadesk assets written')
