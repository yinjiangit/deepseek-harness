/** Keyless document-preview smoke through a real Session, Files tab, shipped renderers, and the default-application controls. */
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { nativeFileManager } from '@deepseek-ai/dsh-native-command'
import { delimiter, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Browser, Locator, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed, vi } from 'vitest'
import { createLaunchEnvironmentSnapshot } from '@deepseek-ai/dsh-launch-environment'
import { pdfFixture, selectionPdfFixture } from '../../../packages/client/ui-sidebar-documentpreview/tests/pdf-fixture.ts'
import { assertFixtureInventory, compareOrRefreshGolden, launchWebScaffold, watchConsole, webSnapshotMode, type WebScaffold } from './scaffold.ts'
import { openSettings, connectFreshWorkspace, newEnglishPage, saveFailureShot, scrollIntoView } from './support.ts'

const FIXTURE = fileURLToPath(new URL('../../../snapshots/web/lifecycle-chrome/session.v3.jsonl', import.meta.url))
const SNAPSHOT_DIR = fileURLToPath(new URL('../../../snapshots/web/document-preview', import.meta.url))
const EXPECTED = join(SNAPSHOT_DIR, 'document.expected.md')
const PAGING_PATCH = join(SNAPSHOT_DIR, 'paging.patch.yml')
const PAGE_LINES = 64
const SHOT_DIR = fileURLToPath(new URL('../../../.artifacts/screenshots/0908-document-preview', import.meta.url))
const PROMPT = 'Reply with the single word LIGHTHOUSE and stop.'
const MODE = webSnapshotMode()
/** The stubbed opener runs as a POSIX script; Windows and WSL keep their real file associations out of the lane. */
const STUB_OPENER = nativeFileManager() !== 'explorer'
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
)

/** Successful render evidence stays outside the committed snapshot inventory. */
async function successShot(page: Page, name: string): Promise<void> {
  await mkdir(SHOT_DIR, { recursive: true })
  await page.screenshot({ path: join(SHOT_DIR, `${name}-${MODE}-${process.pid}.png`), fullPage: true })
}

/** Check the visible loader group against the document body's center. */
async function expectDocumentLoading(preview: Locator): Promise<void> {
  const loading = preview.getByRole('status', { name: 'Rendering document...', exact: true })
  await expect.poll(() => loading.textContent()).toBe('Rendering document...')
  await expect.poll(() => loading.evaluate((node) => {
    const body = node.closest('[data-textpreview-body]')!.getBoundingClientRect()
    const spinner = node.querySelector('svg')!.getBoundingClientRect()
    const label = node.querySelector('span')!.getBoundingClientRect()
    return Math.max(Math.abs(spinner.width - 28), Math.abs(spinner.height - 28),
      Math.abs(spinner.x + spinner.width / 2 - body.x - body.width / 2),
      Math.abs((spinner.top + label.bottom) / 2 - body.y - body.height / 2))
  })).toBeLessThanOrEqual(1)
}

/** Paper edges expose the document backdrop even when fixed zoom overflows the viewport. */
async function expectPdfPageSpacing(preview: Locator): Promise<void> {
  await preview.getByRole('img', { name: 'PDF page 2', exact: true }).waitFor({ state: 'visible' })
  await expect.poll(() => preview.locator('[data-pdf-preview]').evaluate((node) => {
    const body = node.getBoundingClientRect()
    const pages = [...node.querySelectorAll('canvas')].map(page => page.getBoundingClientRect())
    const first = pages[0]!
    const last = pages.at(-1)!
    const inset = Math.min(first.top - body.top, body.bottom - last.bottom,
      ...pages.flatMap(page => [page.left - body.left, body.right - page.right]))
    return Math.max(Math.abs(pages[1]!.top - first.bottom - 12), 12 - inset)
  })).toBeLessThanOrEqual(1)
}

/** Exercise native browser selection and copy, including the text overlay's canvas alignment. */
async function copyPdfText(page: Page, preview: Locator, expected: string): Promise<void> {
  const text = preview.locator('[data-pdf-text] span:not(.markedContent)').filter({ hasText: expected }).first()
  await text.waitFor({ state: 'visible' })
  await expect.poll(() => text.evaluate(node => getComputedStyle(node).userSelect)).toBe('text')
  await expect.poll(() => text.evaluate(node => ({
    background: getComputedStyle(node, '::selection').backgroundColor,
    color: getComputedStyle(node, '::selection').color,
  }))).toEqual({ background: 'color(srgb 0.231373 0.509804 0.964706 / 0.4)', color: 'rgba(0, 0, 0, 0)' })
  await text.click({ clickCount: 3 })
  await expect.poll(() => page.evaluate(() => window.getSelection()?.toString().trim())).toBe(expected)
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(page.url()).origin })
  await page.keyboard.press('ControlOrMeta+C')
  await expect.poll(() => page.evaluate(async () => (await navigator.clipboard.readText()).trim())).toBe(expected)
  await expect.poll(() => preview.locator('[data-pdf-page]').first().evaluate((node) => {
    const canvas = node.querySelector('canvas')!.getBoundingClientRect()
    const layer = node.querySelector('.textLayer')!.getBoundingClientRect()
    return Math.max(Math.abs(layer.width - canvas.width), Math.abs(layer.height - canvas.height),
      Math.abs(layer.left - canvas.left), Math.abs(layer.top - canvas.top))
  })).toBeLessThan(1)
}

/** Trigger the document owner's native scroll handler after a real first page overflows. */
async function scrollForNextPage(body: Locator): Promise<void> {
  await body.evaluate((node) => {
    if (node.scrollHeight <= node.clientHeight) throw new Error('paging fixture does not overflow the document body')
    node.scrollTop = node.scrollHeight
  })
}

/** Read the solid vector fill away from antialiased page edges. */
async function canvasColor(canvas: Locator): Promise<string> {
  return await canvas.evaluate((node) => {
    const surface = node as HTMLCanvasElement
    const context = surface.getContext('2d')
    if (context === null) throw new Error('PDF canvas has no 2D context')
    const pixel = context.getImageData(Math.floor(surface.width / 2), Math.floor(surface.height / 2), 1, 1).data
    if (Number(pixel[3]) !== 255) return 'transparent'
    if (Number(pixel[0]) - Number(pixel[2]) > 150) return 'red'
    if (Number(pixel[2]) - Number(pixel[0]) > 150) return 'blue'
    return 'other'
  })
}

/** Wait for device resolution, subject to the page bitmap allocation limit. */
async function expectPdfResolution(canvas: Locator): Promise<void> {
  await expect.poll(() => canvas.evaluate((node) => {
    const bitmap = node as HTMLCanvasElement
    const width = Number.parseFloat(bitmap.style.getPropertyValue('--pdf-page-width'))
    const height = Number.parseFloat(bitmap.style.getPropertyValue('--pdf-page-height'))
    const expected = Math.min(bitmap.getBoundingClientRect().width * window.devicePixelRatio,
      Math.sqrt(16_777_216 * width / height))
    return Math.abs(bitmap.width - expected)
  })).toBeLessThanOrEqual(1)
}

/** Select a workspace file through the Files tab and wait for its preview identity. */
async function openPreviewFile(column: Locator, filesTab: Locator, preview: Locator, name: string): Promise<void> {
  await filesTab.click()
  await column.locator('[data-files-entry="file"]').getByRole('button', { name, exact: true }).click()
  await expect.poll(async () => (await preview.getAttribute('data-textpreview-url'))?.endsWith(`/${name}`)).toBe(true)
}

/** Move into the bottom reveal zone and wait for the shared zoom control. */
async function revealDocumentZoom(page: Page, preview: Locator): Promise<Locator> {
  const frame = preview.locator('[data-document-zoom-frame]')
  const bounds = await frame.boundingBox()
  if (bounds === null) throw new Error('document zoom frame has no bounds')
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height - 8)
  const controls = preview.locator('[data-document-zoom-controls]')
  await expect.poll(() => controls.getAttribute('data-document-zoom-visible')).toBe('true')
  return preview.getByRole('button', { name: 'Choose zoom', exact: true })
}

/** Leave the bottom reveal zone and wait for the delayed dismissal. */
async function hideDocumentZoom(page: Page, preview: Locator): Promise<void> {
  const frame = preview.locator('[data-document-zoom-frame]')
  const bounds = await frame.boundingBox()
  if (bounds === null) throw new Error('document zoom frame has no bounds')
  await page.mouse.move(bounds.x + 8, bounds.y + 8)
  await expect.poll(() => preview.locator('[data-document-zoom-controls]').getAttribute('data-document-zoom-visible')).toBeNull()
}




/** Sample the pixel band before the divider center, excluding the adjacent cell grid line. */


describe.skipIf(MODE === 'record')('web e2e: document preview through Files', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let tripwire: ReturnType<typeof watchConsole>
  let outsideRoot: string | undefined
  let nativeRoot: string | undefined
  let openLog = ''
  let launchLog = ''
  let appsCatalog = ''
  let linuxMimeDefault = ''
  let launchTarget = ''
  const opened = async (): Promise<Array<{ path: string; action: 'open' | 'reveal' | 'application' }>> =>
    (await readFile(openLog, 'utf8')).split('\n').filter(Boolean).map(line => JSON.parse(line) as { path: string; action: 'open' | 'reveal' | 'application' })
  /** The application each `open -a` gesture named; the opened log keeps only the file path. */
  const launched = async (): Promise<Array<{ app: string; path: string }>> =>
    (await readFile(launchLog, 'utf8')).split('\n').filter(Boolean).map(line => JSON.parse(line) as { app: string; path: string })

  beforeAll(async () => {
    outsideRoot = await mkdtemp(join(tmpdir(), 'dsh-preview-outside-'))
    if (STUB_OPENER) {
      // Exercise the built Host through its actual OS command, replacing only the desktop application.
      nativeRoot = await mkdtemp(join(tmpdir(), 'dsh-preview-native-'))
      openLog = join(nativeRoot, 'opened.jsonl')
      launchLog = join(nativeRoot, 'launched.jsonl')
      appsCatalog = join(nativeRoot, 'applications.json')
      await writeFile(openLog, '')
      await writeFile(launchLog, '')
      const command = process.platform === 'darwin' ? 'open' : 'xdg-open'
      await writeFile(join(nativeRoot, command), `#!/usr/bin/env node
const fs = require('node:fs');
const path = process.argv[2] === '-a' ? process.argv[4] : process.argv[2] === '-R' ? process.argv[3] : process.argv[2];
const action = process.argv[2] === '-a' ? 'application' : process.argv[2] === '-R' || fs.statSync(path).isDirectory() ? 'reveal' : 'open';
fs.appendFileSync(${JSON.stringify(openLog)}, JSON.stringify({ path, action }) + '\\n');
if (process.argv[2] === '-a') fs.appendFileSync(${JSON.stringify(launchLog)}, JSON.stringify({ app: process.argv[3], path: process.argv[4] }) + '\\n');
`, { mode: 0o700 })
      if (process.platform === 'darwin') {
        await writeFile(appsCatalog, JSON.stringify([
          { id: '/Applications/Test Player.app', name: 'Test Player', default: true, icon: `data:image/png;base64,${TINY_PNG.toString('base64')}` },
          { id: '/Applications/Other Player.app', name: 'Other Player', default: false, icon: null },
        ]))
        await writeFile(join(nativeRoot, 'osascript'), `#!/usr/bin/env node\nprocess.stdout.write(require('node:fs').readFileSync(${JSON.stringify(appsCatalog)}, 'utf8'));\n`, { mode: 0o700 })
        launchTarget = '/Applications/Test Player.app'
      }
      if (process.platform === 'linux') {
        const data = join(nativeRoot, 'data')
        await mkdir(join(data, 'applications'), { recursive: true })
        const icon = join(nativeRoot, 'icon.png')
        await writeFile(icon, TINY_PNG)
        const testDesktop = join(data, 'applications', 'test.desktop')
        await writeFile(testDesktop, `[Desktop Entry]\nName=Test Player\nIcon=${icon}\n`)
        await writeFile(join(data, 'applications', 'other.desktop'), '[Desktop Entry]\nName=Other Player\n')
        // `gio mime` owns the OS default here, so the marker file is what flips a run to "no default".
        linuxMimeDefault = join(nativeRoot, 'mime-default')
        await writeFile(linuxMimeDefault, 'test.desktop\n')
        await writeFile(join(nativeRoot, 'gio'), `#!/usr/bin/env node
const fs = require('node:fs');
const preferred = fs.readFileSync(${JSON.stringify(linuxMimeDefault)}, 'utf8').trim();
if (process.argv[2] === 'info') process.stdout.write('standard::content-type: video/mp4');
else if (process.argv[2] === 'mime') process.stdout.write((preferred.length > 0 ? 'Default application for video/mp4: ' + preferred + '\\n' : '') + 'Registered applications:\\n  test.desktop\\n  other.desktop\\n');
else if (process.argv[2] === 'launch') {
  fs.appendFileSync(${JSON.stringify(openLog)}, JSON.stringify({ path: process.argv[4], action: 'application' }) + '\\n');
  fs.appendFileSync(${JSON.stringify(launchLog)}, JSON.stringify({ app: process.argv[3], path: process.argv[4] }) + '\\n');
}
else process.exit(1);
`, { mode: 0o700 })
        launchTarget = testDesktop
        vi.stubEnv('XDG_DATA_HOME', data)
        vi.stubEnv('XDG_DATA_DIRS', '')
      }
      vi.stubEnv('PATH', `${nativeRoot}${delimiter}${process.env.PATH ?? ''}`)
    }
    // The Open In rows carry the default-application controls; the SSH marker
    // keeps the host's application catalog empty, so the Session-header split
    // button stays off every platform while the pinned desktop serves the file controls.
    scaffold = await launchWebScaffold({
      developerTools: false, replayFixture: FIXTURE, paceMs: 5, compareReplaySession: false, extraOverlayPath: [PAGING_PATCH, fileURLToPath(new URL('./fixtures/native-open-on.patch.yml', import.meta.url))],
      openInAppEnvironment: createLaunchEnvironmentSnapshot([{ source: 'process', values: { SSH_CONNECTION: '10.0.0.2 55000 10.0.0.9 22' } }]),
    })
    browser = await chromium.launch()
    page = await newEnglishPage(browser)
    tripwire = watchConsole(page)
    await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
    await connectFreshWorkspace(page, scaffold.workspaceCwd)
  })

  afterAll(async () => {
    try {
      await browser?.close()
    } finally {
      try {
        await scaffold?.close()
      } finally {
        vi.unstubAllEnvs()
        if (outsideRoot !== undefined) await rm(outsideRoot, { recursive: true, force: true })
        if (nativeRoot !== undefined) await rm(nativeRoot, { recursive: true, force: true })
      }
    }
  })

  it('opens text, isolated HTML, width-fitted images, and rendered PDF from the Session workspace', async () => {
    onTestFailed(async () => {
      await mkdir(SHOT_DIR, { recursive: true })
      await saveFailureShot(page, `screenshots/0908-document-preview/smoke-${process.pid}`)
    })
    await page.locator('[data-slot="conversation.hero.agentPreset"]').getByRole('button', { name: 'Standard mode', exact: true }).click()
    await expect.poll(() => page.getByRole('menuitem').count()).toBe(2)
    expect(await page.getByRole('menuitem', { name: /^PTC mode|^Minimal mode/ }).count()).toBe(0)
    await page.keyboard.press('Escape')
    expect(scaffold.ctx.settings.describe().find(row => row.ns === 'ui-settings')?.value).toEqual({ enabled: false })
    const settled = scaffold.whenTurnSettled()
    const input = page.locator('[data-composer-input]').first()
    await input.fill(PROMPT)
    await input.press('Enter')
    const sessionId = await settled
    await page.getByText('LIGHTHOUSE', { exact: true }).waitFor({ timeout: 15_000 })
    expect(await page.getByRole('tablist').count()).toBe(0)
    const cwd = scaffold.ctx.agents.get(sessionId)?.session.header.cwd
    if (cwd === undefined) throw new Error('settled Session has no workspace cwd')
    if (outsideRoot === undefined) throw new Error('outside fixture directory is unavailable')
    const outsideScript = join(outsideRoot, 'outside.js')
    const outsideReference = relative(cwd, outsideScript).replace(/\\/g, '/')
    let previewNetworkRequests = 0
    await page.route('https://preview.invalid/developer-tools.png', async (route) => {
      previewNetworkRequests += 1
      await route.fulfill({ status: 200, contentType: 'image/png', body: TINY_PNG })
    })
    const blockedRequests: string[] = []
    await page.route('https://blocked-preview.invalid/**', async (route) => {
      blockedRequests.push(route.request().url())
      await route.fulfill({ status: 200, contentType: 'text/html', body: 'ESCAPED' })
    })
    const markdownText = [
      '# Markdown smoke', '', 'Rendered from the workspace.', '',
      ...Array.from({ length: (PAGE_LINES - 4) / 2 }, (_, index) => [`Paragraph ${index + 1}: ${'visible prefix '.repeat(20)}`, '']).flat(),
      '# Markdown tail',
      '', '![relative image](preview-images/local%20image.png)',
      '', `![absolute image](<${join(cwd, 'tiny.png').replaceAll('\\', '/')}>)`,
      '', '![reference image][local-image]', '', '[local-image]: preview-images/local%20image.png',
    ].join('\n')
    await mkdir(join(cwd, 'preview-images'))
    const codeLines = [
      ...Array.from({ length: PAGE_LINES }, (_, index) => index === 0 ? 'const prefix = "CODE_PREFIX";' : `// prefix line ${index + 1}`),
      'const tail = "CODE_TAIL";',
    ]
    await Promise.all([
      writeFile(join(cwd, 'hostile.html'), `<!doctype html><html lang="en" class="dark"><head>
        <link rel="preconnect" href="https://blocked-preview.invalid">
        <noscript><meta http-equiv="refresh" content="0;url=https://blocked-preview.invalid/refresh"></noscript>
        </head><body style="margin:0"><h1>Static adversarial preview</h1>
        <a id="plain-link" href="https://blocked-preview.invalid/plain">Plain link</a>
        <div><template shadowrootmode="open"><a id="shadow-link" href="https://blocked-preview.invalid/shadow">Shadow link</a><template><iframe src="https://blocked-preview.invalid/frame"></iframe></template></template></div>
        <svg><a id="svg-link" href="https://blocked-preview.invalid/svg"><text y="20">SVG link</text><set attributeName="href" to="https://blocked-preview.invalid/set"/><animate attributeName="href" values="https://blocked-preview.invalid/animate"/></a></svg>
        <img src="https://blocked-preview.invalid/image"><iframe src="https://blocked-preview.invalid/direct-frame"></iframe>
        <math id="math-link" href="https://blocked-preview.invalid/math"><mi>x</mi></math>
        <form><math><mtext></form><form><mglyph><style></math><a id="mutation-link" href="https://blocked-preview.invalid/mutation">Mutation link</a>
        </body></html>`),
      writeFile(join(cwd, 'smoke.md'), markdownText),
      writeFile(join(cwd, 'pages.ts'), codeLines.join('\n')),
      writeFile(join(cwd, 'notes.unknown'), 'UNKNOWN_SUFFIX\nPlain fallback.'),
      writeFile(join(cwd, 'smoke.html'), [
        '<!doctype html><link rel="stylesheet" href="./local.css">',
        '<h1>HTML smoke</h1><p id="result">pending</p><p id="local-result">pending</p><p id="parent-result">pending</p>',
        '<img src="https://preview.invalid/developer-tools.png" width="1" height="1" alt="">',
        '<p id="outside-result">pending</p>',
        '<script>document.getElementById("result").textContent="INLINE_OK";',
        'try{parent.document.documentElement.setAttribute("data-document-preview-escape","true");document.getElementById("parent-result").textContent="parent-accessible"}',
        'catch(error){const result=document.getElementById("parent-result");result.textContent="parent-blocked";result.dataset.error=error.name}</script>',
        '<script src="./local.js"></script>',
        `<script src="${outsideReference}"></script>`,
      ].join('\n')),
      writeFile(join(cwd, 'local.js'), 'document.getElementById("local-result").textContent="LOCAL_JS_OK";'),
      writeFile(join(cwd, 'local.css'), '#local-result { color: rgb(12, 34, 56); }'),
      writeFile(outsideScript, 'document.getElementById("outside-result").textContent="OUTSIDE_JS_OK";'),
      writeFile(join(cwd, 'tiny.png'), TINY_PNG),
      writeFile(join(cwd, 'preview-images', 'local image.png'), TINY_PNG),
      writeFile(join(cwd, 'large.svg'), [
        '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1600" viewBox="0 0 1200 1600">',
        '<script>parent.document.documentElement.setAttribute("data-image-preview-escape","true")</script>',
        '<rect width="1200" height="1600" fill="#2463eb"/>',
        '</svg>',
      ].join('')),
      writeFile(join(cwd, 'smoke.pdf'), pdfFixture()),
      writeFile(join(cwd, 'user-unit.pdf'), pdfFixture(2)),
      ...[90, 180, 270].map(rotation => writeFile(join(cwd, `rotated-${rotation}.pdf`), pdfFixture(4, rotation))),
      writeFile(join(cwd, 'selection.pdf'), selectionPdfFixture()),
      writeFile(join(cwd, 'table.csv'), '00123,"中文,字段","=SUM(1,2)"\n2024-03-01,,TRUE'),
      writeFile(join(cwd, 'table.tsv'), '00123\t"中文\t字段"\t=SUM(1,2)\n2024-03-01\t\tTRUE'),
      ...['doc', 'docx', 'ppt', 'pptx'].map(extension => writeFile(join(cwd, `unavailable.${extension}`), Buffer.from('PK\u0003\u0004OFFICE_BINARY_PREVIEW'))),
      writeFile(join(cwd, 'clip.mp4'), Buffer.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70])),
    ])

    const column = page.locator('[data-rightbar-col]')
    await page.locator('[data-sidebar-right-expand]').click()
    await column.locator('[data-sidebar-right-guide-entry="files"]').click()
    await column.locator('[data-files-state="tree"]').waitFor({ state: 'visible' })
    await column.locator('[data-files-reload]').click()
    const filesTab = column.locator('[data-dockkit-tab]').filter({ has: page.getByText('Files', { exact: true }) })
    const addTab = column.locator('[data-dockkit-add-tab]')
    expect(await column.locator('[data-dockkit-tab]').count()).toBe(1)
    const defaultTitle = await filesTab.locator('[data-dockkit-tab-title]').innerText()
    const initialFilesClose = await filesTab.locator('[data-dockkit-tab-close]').count()
    expect(initialFilesClose).toBe(1)
    await filesTab.click({ button: 'right' })
    await page.locator('[data-context-menu][role="menu"]').waitFor()
    await page.keyboard.press('Escape')
    await addTab.waitFor({ state: 'visible' })
    const initialAdd = await addTab.count()
    expect(initialAdd).toBe(1)
    await addTab.click()
    await column.locator('[data-sidebar-right-guide]').waitFor({ state: 'visible' })
    await expect.poll(() => column.locator('[data-dockkit-tab]').count()).toBe(2)
    const guideTab = column.locator('[data-dockkit-tab]').filter({ hasNot: page.getByText('Files', { exact: true }) })
    const guideClose = await guideTab.locator('[data-dockkit-tab-close]').count()
    const filesCloseWithGuide = await filesTab.locator('[data-dockkit-tab-close]').count()
    expect(guideClose).toBe(1)
    expect(filesCloseWithGuide).toBe(1)
    await expect.poll(() => addTab.count()).toBe(0)
    const addWithGuide = await addTab.count()
    await guideTab.hover()
    await guideTab.locator('[data-dockkit-tab-close]').click()
    await column.locator('[data-files-state="tree"]').waitFor({ state: 'visible' })
    await expect.poll(() => column.locator('[data-sidebar-right-guide]').count()).toBe(0)
    await expect.poll(() => column.locator('[data-dockkit-tab]').count()).toBe(1)
    await addTab.waitFor({ state: 'visible' })
    const restoredFilesClose = await filesTab.locator('[data-dockkit-tab-close]').count()
    const restoredAdd = await addTab.count()
    expect(restoredFilesClose).toBe(1)
    expect(restoredAdd).toBe(1)
    const preview = column.locator('[data-textpreview-url]')
    const openFile = openPreviewFile.bind(undefined, column, filesTab, preview)
    const viewer = preview.locator('[data-document-viewer-menu]')
    const body = preview.locator('[data-textpreview-body]')
    const sections = ['# Document preview']
    sections.push([
      '## Sidebar tabs', '',
      `- Default tab: ${defaultTitle}`,
      `- Files close buttons (alone -> with guide -> restored): ${[initialFilesClose, filesCloseWithGuide, restoredFilesClose].join(' -> ')}`,
      `- Manual guide close buttons: ${guideClose}`,
      `- Add buttons (Files -> guide -> Files): ${[initialAdd, addWithGuide, restoredAdd].join(' -> ')}`,
    ].join('\n'))

    await openFile('smoke.md')
    await expect.poll(() => viewer.innerText()).toBe('Markdown')
    await preview.getByRole('heading', { name: 'Markdown smoke', exact: true }).waitFor({ timeout: 15_000 })
    await preview.getByText('Rendered from the workspace.', { exact: true }).waitFor({ state: 'visible' })
    const heading = await preview.getByRole('heading', { name: 'Markdown smoke', exact: true }).innerText()
    const markdownTail = preview.getByRole('heading', { name: 'Markdown tail', exact: true })
    await expect.poll(() => preview.locator('[data-textpreview-more]').isEnabled()).toBe(true)
    expect(await markdownTail.count()).toBe(0)
    await scrollForNextPage(body)
    await markdownTail.waitFor({ timeout: 15_000 })
    await expect.poll(() => preview.locator('[data-textpreview-more]').count()).toBe(0)
    expect(await preview.getByRole('heading', { name: heading, exact: true }).count()).toBe(1)
    expect(await preview.getByText('Rendered from the workspace.', { exact: true }).count()).toBe(1)
    const tailHeading = await markdownTail.innerText()
    const markdownImages: string[] = []
    for (const alt of ['relative image', 'absolute image', 'reference image']) {
      const image = preview.getByRole('img', { name: alt, exact: true })
      await scrollIntoView(image)
      await expect.poll(() => image.evaluate((node: HTMLImageElement) => node.complete && node.naturalWidth > 0)).toBe(true)
      const source = new URL(await image.getAttribute('src') ?? '')
      expect(source.pathname).toBe('/api/file')
      markdownImages.push(alt)
    }
    await scrollIntoView(preview.getByRole('heading', { name: heading, exact: true }))
    await successShot(page, 'markdown')
    const markdownTab = column.locator('[data-dockkit-tab]').filter({ has: page.getByText('smoke.md', { exact: true }) })
    const markdownTabId = await markdownTab.getAttribute('data-dockkit-tab')
    expect(markdownTabId).not.toBeNull()
    const tabCount = await column.locator('[data-dockkit-tab]').count()
    const markdownViewers = [await viewer.innerText()]
    const sourceFonts: Array<{ fontSize: string; lineHeight: string }> = []
    for (const label of ['Code', 'Plain text']) {
      await viewer.click()
      await page.getByRole('menuitem', { name: label, exact: true }).click()
      await expect.poll(() => viewer.innerText()).toBe(label)
      if (label === 'Code') {
        await preview.locator('.shiki').waitFor({ timeout: 15_000 })
        expect(await preview.locator('.shiki').textContent()).toBe(markdownText)
      } else {
        await expect.poll(async () => (await preview.locator('[data-textpreview-line]').first().textContent())?.trim()).toBe('# Markdown smoke')
      }
      const source = label === 'Code' ? preview.locator('.shiki') : preview.locator('[data-textpreview-line]').first()
      sourceFonts.push(await source.evaluate((node) => {
        const style = getComputedStyle(node)
        return { fontSize: style.fontSize, lineHeight: style.lineHeight }
      }))
      expect(await markdownTab.getAttribute('data-dockkit-tab')).toBe(markdownTabId)
      expect(await column.locator('[data-dockkit-tab]').count()).toBe(tabCount)
      markdownViewers.push(await viewer.innerText())
    }
    expect(sourceFonts[1]).toEqual(sourceFonts[0])
    sections.push([
      '## Markdown', '',
      `- Heading: ${heading}`,
      `- Tail loaded by scrolling: ${tailHeading}`,
      `- Loaded images: ${markdownImages.join(' | ')}`,
      `- Viewers: ${markdownViewers.join(' -> ')}`,
      `- Same tab: ${String(await markdownTab.getAttribute('data-dockkit-tab') === markdownTabId)}`,
    ].join('\n'))

    await openFile('hostile.html')
    const hostileFrame = page.frameLocator('[data-html-preview]')
    await hostileFrame.getByRole('heading', { name: 'Static adversarial preview' }).waitFor()
    expect(await hostileFrame.locator('html').getAttribute('class')).toBe('dark')
    expect(await hostileFrame.locator('body').evaluate(node => getComputedStyle(node).margin)).toBe('0px')
    for (const id of ['plain-link', 'svg-link', 'math-link']) {
      const link = hostileFrame.locator(`#${id}`)
      expect(await link.getAttribute('href')).toBeNull()
      await link.click()
    }
    // DOMPurify leaves ordinary templates inert and removes declarative shadow roots.
    expect(await hostileFrame.locator('#shadow-link').count()).toBe(0)
    expect(await hostileFrame.locator('[href], [xlink\\:href]').count()).toBe(0)
    const mutationLink = hostileFrame.locator('#mutation-link')
    if (await mutationLink.count() > 0) await mutationLink.click()
    expect(await hostileFrame.locator('noscript, link, set, animate, iframe').count()).toBe(0)
    expect(blockedRequests).toEqual([])
    await hostileFrame.getByRole('heading', { name: 'Static adversarial preview' }).waitFor()

    await openFile('smoke.html')
    await expect.poll(() => viewer.innerText()).toBe('HTML')
    const iframe = preview.locator('[data-html-preview]')
    await iframe.waitFor({ timeout: 15_000 })
    expect(await iframe.getAttribute('sandbox')).toBe('')
    const basicHtml = page.frameLocator('[data-html-preview]')
    await basicHtml.getByRole('heading', { name: 'HTML smoke', exact: true }).waitFor()
    expect(await basicHtml.locator('#result').innerText()).toBe('pending')
    expect(await basicHtml.locator('#local-result').innerText()).toBe('pending')
    expect(previewNetworkRequests).toBe(0)
    await successShot(page, 'html-basic')
    sections.push([
      '## Basic HTML', '',
      '- Developer tools: disabled for this scenario',
      '- Sandbox: no permissions',
      `- Inline script: ${await basicHtml.locator('#result').innerText()}`,
      `- Local script: ${await basicHtml.locator('#local-result').innerText()}`,
      `- Network requests: ${previewNetworkRequests}`,
    ].join('\n'))
    await openSettings(page, 'en')
    const settings = page.getByRole('dialog', { name: 'Settings' })
    await settings.getByRole('switch', { name: 'Show coding view' }).click()
    await expect.poll(() => settings.getByRole('switch', { name: 'Show coding view' }).getAttribute('aria-checked')).toBe('true')
    await successShot(page, 'developer-tools-setting')
    await settings.getByRole('button', { name: 'Close', exact: true }).click()
    await expect.poll(() => iframe.getAttribute('sandbox')).toBe('allow-scripts')
    expect(await iframe.getAttribute('sandbox')).toBe('allow-scripts')
    expect(await iframe.evaluate((node) => {
      const host = node.closest('[data-textpreview-body]')
      if (!(host instanceof HTMLElement)) throw new Error('HTML preview body is unavailable')
      const outer = host.getBoundingClientRect()
      const frame = node.getBoundingClientRect()
      return {
        top: Math.round(frame.top - outer.top),
        right: Math.round(outer.right - frame.right),
        bottom: Math.round(outer.bottom - frame.bottom),
        left: Math.round(frame.left - outer.left),
      }
    })).toEqual({ top: 0, right: 0, bottom: 0, left: 0 })
    const html = page.frameLocator('[data-html-preview]')
    await html.getByRole('heading', { name: 'HTML smoke', exact: true }).waitFor({ timeout: 15_000 })
    await expect.poll(() => html.locator('#result').innerText()).toBe('INLINE_OK')
    await expect.poll(() => html.locator('img[src="https://preview.invalid/developer-tools.png"]')
      .evaluate(node => (node as HTMLImageElement).naturalWidth)).toBe(1)
    await expect.poll(() => html.locator('#local-result').innerText()).toBe('LOCAL_JS_OK')
    await expect.poll(() => html.locator('#outside-result').innerText()).toBe('OUTSIDE_JS_OK')
    await expect.poll(() => html.locator('#local-result').evaluate(node => getComputedStyle(node).color)).toBe('rgb(12, 34, 56)')
    await expect.poll(() => html.locator('#parent-result').innerText()).toBe('parent-blocked')
    expect(await html.locator('#parent-result').getAttribute('data-error')).toBe('SecurityError')
    expect(await page.locator('html').getAttribute('data-document-preview-escape')).toBeNull()
    expect(previewNetworkRequests).toBe(1)
    const beforeStyleSave = await iframe.getAttribute('src')
    await writeFile(join(cwd, 'local.css'), '#local-result { color: rgb(56, 34, 12); }')
    await expect.poll(() => html.locator('#local-result').evaluate(node => getComputedStyle(node).color)).toBe('rgb(56, 34, 12)')
    expect(await iframe.getAttribute('src')).not.toBe(beforeStyleSave)
    const beforeScriptSave = await iframe.getAttribute('src')
    await writeFile(join(cwd, 'local.js'), 'document.getElementById("local-result").textContent="LOCAL_JS_REFRESHED";')
    await expect.poll(() => html.locator('#local-result').innerText()).toBe('LOCAL_JS_REFRESHED')
    expect(await iframe.getAttribute('src')).not.toBe(beforeScriptSave)
    await page.getByRole('tab', { name: /Trajectory/ }).click()
    await scaffold.ctx.settings.update('ui-settings', { enabled: false })
    await expect.poll(() => page.getByRole('tab', { name: /Trajectory/ }).count()).toBe(0)
    await expect.poll(() => iframe.getAttribute('sandbox')).toBe('')
    expect(await page.getByText('LIGHTHOUSE', { exact: true }).count()).toBeGreaterThan(0)
    await scaffold.ctx.settings.update('ui-settings', { enabled: true })
    await expect.poll(() => iframe.getAttribute('sandbox')).toBe('allow-scripts')
    await expect.poll(() => html.locator('#result').innerText()).toBe('INLINE_OK')
    await successShot(page, 'html')
    sections.push([
      '## HTML', '',
      `- Viewer: ${await viewer.innerText()}`,
      `- Sandbox: ${await iframe.getAttribute('sandbox')}`,
      `- Inline script: ${await html.locator('#result').innerText()}`,
      `- Local script after save: ${await html.locator('#local-result').innerText()}`,
      `- Outside-workspace script: ${await html.locator('#outside-result').innerText()}`,
      `- Local stylesheet after save: ${await html.locator('#local-result').evaluate(node => getComputedStyle(node).color)}`,
      `- Parent access: ${await html.locator('#parent-result').innerText()} (${await html.locator('#parent-result').getAttribute('data-error')})`,
      `- Parent unchanged: ${String(await page.locator('html').getAttribute('data-document-preview-escape') === null)}`,
    ].join('\n'))

    await openFile('smoke.pdf')
    const canvas = preview.getByRole('img', { name: 'PDF page 1', exact: true })
    await canvas.waitFor({ state: 'visible', timeout: 30_000 })
    expect(await viewer.count()).toBe(0)
    const zoomControls = preview.locator('[data-document-zoom-controls]')
    await expect.poll(() => zoomControls.getAttribute('data-document-zoom-visible')).toBeNull()
    let pdfZoom = await revealDocumentZoom(page, preview)
    await hideDocumentZoom(page, preview)
    pdfZoom = await revealDocumentZoom(page, preview)
    const pdfWidth = (await canvas.boundingBox())!.width
    const pdfIntrinsicWidth = await canvas.evaluate(node => Number.parseFloat(node.style.getPropertyValue('--pdf-page-width')))
    await expect.poll(() => pdfZoom.innerText()).toBe(`${String(Math.round(pdfWidth / pdfIntrinsicWidth * 100))}%`)
    await pdfZoom.click()
    await page.getByRole('menuitem', { name: '100%', exact: true }).click()
    await expect.poll(async () => (await canvas.boundingBox())!.width).toBeCloseTo(pdfIntrinsicWidth, 0)
    pdfZoom = await revealDocumentZoom(page, preview)
    await pdfZoom.click()
    await page.getByRole('menuitem', { name: '150%', exact: true }).click()
    await expect.poll(async () => (await canvas.boundingBox())!.width / pdfIntrinsicWidth).toBeCloseTo(1.5, 1)
    await expectPdfResolution(canvas)
    await expectPdfPageSpacing(preview)
    pdfZoom = await revealDocumentZoom(page, preview)
    await pdfZoom.click()
    await page.getByRole('menuitem', { name: 'Fit width', exact: true }).click()
    await expect.poll(async () => (await canvas.boundingBox())!.width).toBeCloseTo(pdfWidth, 0)
    await expectPdfResolution(canvas)
    expect(await preview.locator('[data-pdf-page]').count()).toBe(2)
    await expect.poll(() => canvasColor(canvas), { timeout: 30_000 }).toBe('red')
    const firstColor = await canvasColor(canvas)
    expect(firstColor).toBe('red')
    const workerNames = await Promise.all(page.workers().map(worker => worker.evaluate(() => self.name)))
    expect(workerNames).toContain('dsh-pdf')
    await scrollIntoView(preview.locator('[data-pdf-page="2"]'))
    const secondPage = preview.getByRole('img', { name: 'PDF page 2', exact: true })
    await secondPage.waitFor({ state: 'visible', timeout: 30_000 })
    await expect.poll(() => canvasColor(secondPage), { timeout: 30_000 }).toBe('blue')
    const secondColor = await canvasColor(secondPage)
    expect(secondColor).toBe('blue')
    for (const colorScheme of ['dark', 'light'] as const) {
      await page.emulateMedia({ colorScheme })
      await expect.poll(() => page.locator('body').getAttribute('data-ds-dark-theme')).toBe(colorScheme === 'dark' ? '' : null)
      await expectPdfPageSpacing(preview)
      await copyPdfText(page, preview, 'Selectable PDF text')
      await successShot(page, `pdf-spacing-${colorScheme}`)
    }
    expect(await body.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true)
    const pdfTab = column.locator('[data-dockkit-tab]').filter({ has: page.getByText('smoke.pdf', { exact: true }) })
    const pdfTabId = await pdfTab.getAttribute('data-dockkit-tab')
    expect(pdfTabId).not.toBeNull()
    await filesTab.click()
    await column.locator('[data-files-state="tree"]').waitFor({ state: 'visible' })
    await pdfTab.click()
    await scrollIntoView(preview.locator('[data-pdf-page="2"]'))
    await secondPage.waitFor({ state: 'visible', timeout: 30_000 })
    await expect.poll(() => canvasColor(secondPage), { timeout: 30_000 }).toBe('blue')
    const restoredColor = await canvasColor(secondPage)
    expect(restoredColor).toBe('blue')
    expect(await pdfTab.getAttribute('data-dockkit-tab')).toBe(pdfTabId)
    await copyPdfText(page, preview, 'Selectable PDF text')
    await successShot(page, 'pdf')
    sections.push([
      '## PDF', '',
      `- Viewer menu hidden: ${String(await viewer.count() === 0)}`,
      `- Worker: ${workerNames.find(name => name === 'dsh-pdf')}`,
      `- Continuous pages: ${await preview.locator('[data-pdf-page]').count()}`,
      '- Zoom reveal: hidden -> bottom hover -> delayed hidden',
      '- Zoom modes: fit width -> 100% -> 150% -> fit width',
      '- Paper layout: 12px page gaps and outer backdrop insets in both themes',
      '- Settled zoom redraws the page at device resolution',
      `- Horizontal overflow: ${String(await body.evaluate(node => node.scrollWidth > node.clientWidth))}`,
      `- Canvas fills: ${[firstColor, secondColor, restoredColor].join(' -> ')}`,
      `- Same tab: ${String(await pdfTab.getAttribute('data-dockkit-tab') === pdfTabId)}`,
      '- Selected and copied text: Selectable PDF text',
    ].join('\n'))

    await openFile('user-unit.pdf')
    await preview.getByRole('img', { name: 'PDF page 1', exact: true }).waitFor({ state: 'visible' })
    await copyPdfText(page, preview, 'Selectable PDF text')
    sections.push('## PDF page units\n\n- UserUnit 2: selected and copied text aligns with the canvas')

    const viewportSize = page.viewportSize()!
    try {
      for (const rotation of [90, 180, 270]) {
        await openFile(`rotated-${rotation}.pdf`)
        for (const width of [viewportSize.width, 1280]) {
          await page.setViewportSize({ ...viewportSize, width })
          await copyPdfText(page, preview, 'Selectable PDF text')
          // The fixture's only black pixels are text; canvas ink is independent of the overlay geometry.
          await expect.poll(() => preview.locator('[data-pdf-page]').first().evaluate((node) => {
            const canvas = node.querySelector('canvas')!
            const canvasBox = canvas.getBoundingClientRect()
            const textBox = node.querySelector('.textLayer span')!.getBoundingClientRect()
            const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data
            let ink = 0
            let aligned = 0
            for (let i = 0; i < pixels.length; i += 4) {
              if (pixels[i + 3]! < 128 || Math.max(pixels[i]!, pixels[i + 1]!, pixels[i + 2]!) > 80) continue
              ink++
              const x = canvasBox.left + ((i / 4) % canvas.width + 0.5) * canvasBox.width / canvas.width
              const y = canvasBox.top + (Math.floor(i / 4 / canvas.width) + 0.5) * canvasBox.height / canvas.height
              if (x >= textBox.left - 1 && x <= textBox.right + 1 && y >= textBox.top - 1 && y <= textBox.bottom + 1) aligned++
            }
            return ink === 0 ? 0 : aligned / ink
          })).toBeGreaterThan(0.95)
        }
      }
    } finally { await page.setViewportSize(viewportSize) }
    sections.push('## PDF page rotation\n\n- 90, 180, 270 degrees: selection and copied text align with canvas ink before and after resizing')

    await openFile('selection.pdf')
    await preview.getByRole('img', { name: 'PDF page 1', exact: true }).waitFor({ state: 'visible' })
    const selectionLayer = preview.locator('.textLayer')
    const selectionText = selectionLayer.locator('span:not(.markedContent)')
    const titleText = selectionText.filter({ hasText: 'JOURNAL' })
    const priorityText = selectionText.filter({ hasText: 'HIGH / MEDIUM / LOW' }).first()
    // The text resize observer aligns the overlay after the canvas becomes visible.
    await titleText.waitFor({ state: 'visible' })
    await priorityText.waitFor({ state: 'visible' })
    const titleBox = await titleText.boundingBox()
    const priorityBox = await priorityText.boundingBox()
    if (titleBox === null || priorityBox === null) throw new Error('selection fixture text has no bounds')
    const start = { x: titleBox.x + 1, y: titleBox.y + titleBox.height / 2 }
    const end = { x: priorityBox.x + priorityBox.width / 2, y: priorityBox.y - 3 }
    const drag = async (from: typeof start, to: typeof end, through?: typeof end): Promise<string> => {
      await page.mouse.move(from.x, from.y)
      await page.mouse.down()
      try {
        if (through !== undefined) await page.mouse.move(through.x, through.y, { steps: 15 })
        await page.mouse.move(to.x, to.y, { steps: 15 })
        return await page.evaluate(() => window.getSelection()?.toString() ?? '')
      } finally { await page.mouse.up() }
    }
    const priority = { x: end.x, y: priorityBox.y + priorityBox.height / 2 }
    const forward = await drag(start, end, priority)
    expect(forward).toContain('JOURNAL')
    expect(forward).toContain('THREE TASKS')
    expect(forward).not.toContain('REFLECTION')
    expect(forward).not.toContain('AFTER TABLE')
    expect(await page.evaluate(() => window.getSelection()?.toString())).toBe(forward)
    const backward = await drag(priority, start)
    expect(backward).toContain('THREE TASKS')
    expect(backward).not.toContain('REFLECTION')
    expect(backward).not.toContain('AFTER TABLE')
    expect(await page.evaluate(() => window.getSelection()?.toString())).toBe(backward)
    expect(await selectionLayer.locator('br').first().evaluate(node => getComputedStyle(node, '::selection').backgroundColor))
      .toBe('rgba(0, 0, 0, 0)')
    await successShot(page, 'pdf-drag-selection')
    sections.push('## PDF drag selection\n\n- Table selection: forward and backward drags exclude later sections\n- Line-break highlight: transparent\n- Text selection: translucent blue in light and dark themes; canvas text remains visible\n- Mouse release preserves the selected text')

    const pngResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/api/workspaceFiles/readBytes'
      && (response.request().postDataJSON() as { payload: { args: { path: string } } }).payload.args.path === 'tiny.png')
    await openFile('tiny.png')
    const transferred = await pngResponse
    expect(transferred.headers()['content-type']).toMatch(/^multipart\/form-data;/)
    const transferredBody = await new Response(new Uint8Array(await transferred.body()), { headers: transferred.headers() }).formData()
    const metadata = transferredBody.get('metadata')
    if (typeof metadata !== 'string') throw new Error('missing PNG metadata')
    const { attachments } = JSON.parse(metadata) as { attachments: { path: string[]; codec: string; part: string }[] }
    expect(attachments).toHaveLength(1)
    expect(attachments[0]).toMatchObject({ path: ['data'], codec: 'bytes' })
    expect(attachments[0]!.part).toEqual(expect.any(String))
    const transferredFile = transferredBody.get(attachments[0]!.part)
    if (transferredFile === null || typeof transferredFile === 'string') throw new Error('missing PNG payload')
    expect(Buffer.from(await transferredFile.arrayBuffer())).toEqual(TINY_PNG)
    const tinyImage = preview.getByRole('img', { name: 'Image preview: tiny.png', exact: true })
    await tinyImage.waitFor({ state: 'visible', timeout: 15_000 })
    expect(await viewer.count()).toBe(0)
    expect(await tinyImage.evaluate(node => ({
      width: (node as HTMLImageElement).naturalWidth,
      height: (node as HTMLImageElement).naturalHeight,
      draggable: (node as HTMLImageElement).draggable,
    }))).toEqual({ width: 1, height: 1, draggable: true })
    const centering = await tinyImage.evaluate((node) => {
      const image = node.getBoundingClientRect()
      const scroller = node.closest('[data-textpreview-body]')?.getBoundingClientRect()
      if (scroller === undefined) throw new Error('image document scroller is unavailable')
      return {
        horizontal: Math.abs((image.left + image.width / 2) - (scroller.left + scroller.width / 2)),
        vertical: Math.abs((image.top + image.height / 2) - (scroller.top + scroller.height / 2)),
      }
    })
    expect(centering.horizontal).toBeLessThan(10)
    expect(centering.vertical).toBeLessThan(10)
    let imageZoom = await revealDocumentZoom(page, preview)
    await expect.poll(() => imageZoom.innerText()).toBe('100%')
    const tinyWidth = (await tinyImage.boundingBox())!.width
    await imageZoom.click()
    await page.getByRole('menuitem', { name: '200%', exact: true }).click()
    await expect.poll(async () => (await tinyImage.boundingBox())!.width / tinyWidth).toBeCloseTo(2, 1)
    imageZoom = await revealDocumentZoom(page, preview)
    await imageZoom.click()
    await page.getByRole('menuitem', { name: 'Fit width', exact: true }).click()
    await expect.poll(() => imageZoom.innerText()).toBe('100%')

    await tinyImage.dragTo(input)
    const draggedPreview = page.getByRole('group', { name: 'Pending attachments', exact: true }).getByRole('img')
    await draggedPreview.waitFor({ state: 'visible', timeout: 5000 })
    const draggedBytes = await draggedPreview.evaluate(async (node: HTMLImageElement) =>
      Array.from(new Uint8Array(await (await fetch(node.src)).arrayBuffer())))
    expect(Buffer.from(draggedBytes)).toEqual(TINY_PNG)
    expect(await input.innerText()).toBe('')
    await page.getByRole('button', { name: 'Remove image tiny.png', exact: true }).click()
    const endedDrag = await tinyImage.evaluateHandle((node) => {
      const proof = { token: '', started: false, ended: false }
      window.addEventListener('dragstart', (event) => {
        proof.token = event.dataTransfer!.getData('application/x-dsh-file')
        proof.started = event.isTrusted && proof.token !== ''
      }, { once: true })
      node.addEventListener('dragend', (event) => { proof.ended = event.isTrusted && !node.isConnected }, { once: true })
      return proof
    })
    const tinyRect = (await tinyImage.boundingBox())!
    const inputRect = (await input.boundingBox())!
    await page.mouse.move(tinyRect.x + tinyRect.width / 2, tinyRect.y + tinyRect.height / 2)
    await page.mouse.down()
    await page.mouse.move(tinyRect.x - 20, tinyRect.y, { steps: 4 })
    await expect.poll(() => endedDrag.evaluate(proof => proof.started)).toBe(true)
    const tinyTab = column.locator('[data-dockkit-tab]').filter({ has: page.getByText('tiny.png', { exact: true }) })
    await tinyTab.locator('[data-dockkit-tab-close]').evaluate((button: HTMLElement) => { button.click() })
    await tinyImage.waitFor({ state: 'detached' })
    await page.mouse.move(inputRect.x + inputRect.width / 2, inputRect.y + inputRect.height / 2, { steps: 5 })
    await page.mouse.up()
    await draggedPreview.waitFor({ state: 'visible', timeout: 5000 })
    expect(Buffer.from(await draggedPreview.evaluate(async (node: HTMLImageElement) =>
      Array.from(new Uint8Array(await (await fetch(node.src)).arrayBuffer()))))).toEqual(TINY_PNG)
    await expect.poll(() => endedDrag.evaluate(proof => proof.ended)).toBe(true)
    await page.getByRole('button', { name: 'Remove image tiny.png', exact: true }).click()
    const retiredToken = await endedDrag.evaluate(proof => proof.token)
    await input.evaluate((node, token) => {
      const dataTransfer = new DataTransfer()
      dataTransfer.setData('application/x-dsh-file', token)
      node.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer }))
    }, retiredToken)
    expect(await draggedPreview.count()).toBe(0)
    await endedDrag.dispose()
    await openFile('large.svg')
    await expect.poll(() => viewer.innerText()).toBe('Image')
    await viewer.click()
    await page.getByRole('menuitem', { name: 'Plain text', exact: true }).waitFor({ timeout: 15_000 })
    await page.keyboard.press('Escape')
    const largeImage = preview.getByRole('img', { name: 'Image preview: large.svg', exact: true })
    await largeImage.waitFor({ state: 'visible', timeout: 15_000 })
    const fitted = await largeImage.evaluate((node) => {
      const image = node as HTMLImageElement
      const scroller = image.closest('[data-textpreview-body]')
      if (scroller === null) throw new Error('image document scroller is unavailable')
      const rect = image.getBoundingClientRect()
      return {
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
        width: rect.width,
        height: rect.height,
        paneWidth: scroller.clientWidth,
        paneHeight: scroller.clientHeight,
      }
    })
    expect(fitted).toMatchObject({ naturalWidth: 1200, naturalHeight: 1600 })
    expect(fitted.width).toBeLessThan(1200)
    // Width fit: the image fills the frame's 12px-inset box while the aspect ratio holds.
    expect(Math.abs((fitted.paneWidth - 24) - fitted.width)).toBeLessThanOrEqual(1)
    expect(fitted.height / fitted.width).toBeCloseTo(1600 / 1200, 2)
    let svgZoom = await revealDocumentZoom(page, preview)
    await expect.poll(async () => Number.parseInt(await svgZoom.innerText(), 10)).toBeCloseTo(fitted.width / 12, 0)
    const imageScrollport = preview.locator('[data-document-zoom-scrollport]')
    const fitScrolled = await imageScrollport.evaluate((node) => {
      node.scrollLeft = node.scrollWidth
      return { left: node.scrollLeft, horizontalOverflow: node.scrollWidth > node.clientWidth }
    })
    expect(fitScrolled).toEqual({ left: 0, horizontalOverflow: false })
    await svgZoom.click()
    await page.getByRole('menuitem', { name: '100%', exact: true }).click()
    await expect.poll(async () => (await largeImage.boundingBox())!.width).toBeCloseTo(1200, 0)
    expect(await imageScrollport.evaluate(node => node.scrollWidth > node.clientWidth)).toBe(true)
    await imageScrollport.evaluate((node) => { node.scrollLeft = 0; node.scrollTop = 0 })
    const panBox = await imageScrollport.boundingBox()
    if (panBox === null) throw new Error('image viewport missing')
    await expect.poll(() => largeImage.evaluate(node => getComputedStyle(node).cursor)).toBe('grab')
    await page.mouse.move(panBox.x + 180, panBox.y + 180)
    await page.mouse.down()
    await page.mouse.move(panBox.x + 100, panBox.y + 100, { steps: 8 })
    await expect.poll(() => imageScrollport.evaluate(node => [node.scrollLeft, node.scrollTop])).toEqual([80, 80])
    await expect.poll(() => largeImage.evaluate(node => getComputedStyle(node).cursor)).toBe('grabbing')
    await page.mouse.up()
    await expect.poll(() => largeImage.evaluate(node => getComputedStyle(node).cursor)).toBe('grab')
    svgZoom = await revealDocumentZoom(page, preview)
    await svgZoom.click()
    await page.getByRole('menuitem', { name: 'Fit width', exact: true }).click()
    await expect.poll(async () => (await largeImage.boundingBox())!.width).toBeCloseTo(fitted.width, 0)
    expect(await imageScrollport.evaluate(node => node.scrollWidth > node.clientWidth)).toBe(false)
    expect(await page.locator('html').getAttribute('data-image-preview-escape')).toBeNull()
    sections.push([
      '## Image zoom', '',
      '- Contained sidebar PNG drags into the composer as an original-byte image attachment',
      '- Small PNG fit width remains at intrinsic size; 200% doubles it',
      '- SVG fit width -> 100% -> fit width toggles horizontal overflow: false -> true -> false',
      '- Image and Blob identities remain stable while zoom changes',
      '- Overflowing image drag pans both axes by 80px; releasing restores the grab cursor',
    ].join('\n'))

    const releaseRead = Promise.withResolvers<undefined>()
    let waitingForRead = false
    const readPage = scaffold.ctx.workspaceFiles.read.bind(scaffold.ctx.workspaceFiles)
    const heldRead = vi.spyOn(scaffold.ctx.workspaceFiles, 'read').mockImplementation(async (agent, path, range, signal) => {
      if (path === 'pages.ts' && (range.offset ?? 1) === 1) {
        waitingForRead = true
        await releaseRead.promise
      }
      return readPage(agent, path, range, signal)
    })
    let initialReading = false
    try {
      await openFile('pages.ts')
      await expect.poll(() => waitingForRead).toBe(true)
      const reading = preview.locator('[data-document-loading]')
      await expectDocumentLoading(preview)
      initialReading = await reading.isVisible()
      expect(initialReading).toBe(true)
      expect(await preview.locator('[data-code-preview]').count()).toBe(0)
      const bounds = await reading.evaluate((node) => {
        const body = node.closest('[data-textpreview-body]')
        if (body === null) throw new Error('reading indicator has no document body')
        const indicator = node.getBoundingClientRect()
        const scroller = body.getBoundingClientRect()
        return { top: indicator.top - scroller.top, bottom: scroller.bottom - indicator.bottom }
      })
      expect(bounds.top).toBeGreaterThanOrEqual(0)
      expect(bounds.bottom).toBeGreaterThanOrEqual(0)
      await successShot(page, 'code-reading')
    } finally {
      releaseRead.resolve(undefined)
      heldRead.mockRestore()
    }
    await expect.poll(() => viewer.innerText()).toBe('Code')
    const highlightedLines = preview.locator('.shiki .line')
    await expect.poll(() => highlightedLines.count(), { timeout: 15_000 }).toBe(PAGE_LINES)
    const codeBlock = preview.locator('.md-code-block')
    const codeScrollport = preview.locator('[data-code-block-content]')
    expect(await codeBlock.getAttribute('data-line-numbers')).toBe('true')
    await expect.poll(() => highlightedLines.first().evaluate(node => getComputedStyle(node, '::before').content))
      .not.toMatch(/^(?:none|normal)$/u)
    const numbering = await highlightedLines.first().evaluate((node) => {
      const line = getComputedStyle(node)
      const before = getComputedStyle(node, '::before')
      return {
        counterIncrement: line.counterIncrement,
        gutterWidth: Number.parseFloat(before.width),
        sourceInset: Number.parseFloat(line.paddingInlineStart),
      }
    })
    expect(numbering.counterIncrement).toBe('source-line 1')
    expect(numbering.gutterWidth).toBeGreaterThan(0)
    expect(numbering.sourceInset).toBeGreaterThan(numbering.gutterWidth)
    const prefix = await highlightedLines.allTextContents()
    expect(prefix).toEqual(codeLines.slice(0, PAGE_LINES))
    await expect.poll(() => preview.locator('[data-textpreview-more]').isEnabled()).toBe(true)
    await scrollForNextPage(codeScrollport)
    await expect.poll(() => highlightedLines.count(), { timeout: 15_000 }).toBe(codeLines.length)
    const completed = await highlightedLines.allTextContents()
    expect(completed).toEqual(codeLines)
    await expect.poll(() => preview.locator('[data-textpreview-more]').count()).toBe(0)
    const scrollTop = await codeScrollport.evaluate((node) => {
      const target = Math.floor((node.scrollHeight - node.clientHeight) / 2)
      if (target <= 0) throw new Error('code fixture does not overflow the document body')
      node.scrollTop = target
      return target
    })
    await expect.poll(() => codeScrollport.evaluate((node) => {
      const codeBlock = node.parentElement
      const banner = codeBlock?.firstElementChild
      const firstLine = node.querySelector('.shiki .line')
      if (!(banner instanceof HTMLElement) || firstLine === null) throw new Error('missing rendered code banner or source line')
      const bounds = node.getBoundingClientRect()
      const clipTop = bounds.top + node.clientTop
      const bannerBounds = banner.getBoundingClientRect()
      return {
        scrollTop: node.scrollTop,
        scrollportBelowBanner: Math.abs(bannerBounds.bottom - bounds.top) < 1,
        firstLineAbove: firstLine.getBoundingClientRect().top < clipTop,
      }
    })).toEqual({ scrollTop, scrollportBelowBanner: true, firstLineAbove: true })
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(page.url()).origin })
    await page.evaluate(() => navigator.clipboard.writeText(''))
    const copyCode = codeBlock.getByRole('button', { name: 'Copy', exact: true })
    expect(await codeBlock.getByRole('button').count()).toBe(1)
    expect(await copyCode.textContent()).toBe('')
    await copyCode.hover()
    await page.getByRole('tooltip', { name: 'Copy', exact: true }).waitFor()
    await copyCode.click()
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(codeLines.join('\n'))
    sections.push([
      '## Code paging', '',
      `- Viewer: ${await viewer.innerText()}`,
      `- Initial reading indicator: ${initialReading}`,
      '- Loading feedback: centered 28px spinner with "Rendering document..."',
      `- Lines: ${prefix.length} -> ${completed.length}`,
      `- Prefix retained: ${String(JSON.stringify(completed.slice(0, prefix.length)) === JSON.stringify(prefix))}`,
      `- Tail: ${completed.at(-1)}`,
    ].join('\n'))

    const officeMenus: number[] = []
    const configurationGuide = 'Read failed: Office previews are unavailable. Enable the document preview service on the computer running AlphaDesk.'
    for (const extension of ['doc', 'docx', 'ppt', 'pptx']) {
      await openFile(`unavailable.${extension}`)
      expect(await preview.locator('[data-document-viewer-menu]').count()).toBe(0)
      await preview.getByText(configurationGuide, { exact: true }).waitFor({ timeout: 15_000 })
      expect(await preview.locator('[data-textpreview-line]').count()).toBe(0)
      expect(await preview.getByText('OFFICE_BINARY_PREVIEW', { exact: false }).count()).toBe(0)
      officeMenus.push(await viewer.count())
    }
    await successShot(page, 'office-unavailable')
    sections.push([
      '## Office unavailable', '',
      `- DOC, DOCX, PPT, PPTX viewer menus: ${officeMenus.join(' | ')}`,
      `- Guidance: ${configurationGuide}`,
      '- Binary text shown: false',
      '- Plain-text option and viewer picker: hidden',
    ].join('\n'))


    await openFile('notes.unknown')
    const plainLines = preview.locator('[data-textpreview-line]')
    await expect.poll(() => plainLines.count()).toBe(2)
    // Plain text is the only candidate, so no viewer menu renders.
    expect(await viewer.count()).toBe(0)
    const fallback = (await plainLines.allTextContents()).map(line => line.trim())
    expect(fallback).toEqual(['UNKNOWN_SUFFIX', 'Plain fallback.'])
    sections.push(['## Unknown suffix', '', `- Viewer menu hidden: ${String(await viewer.count() === 0)}`, `- Text: ${fallback.join(' | ')}`].join('\n'))

    await filesTab.click()
    await column.locator('[data-files-entry="file"]').getByRole('button', { name: 'clip.mp4', exact: true }).click()
    const unsupported = column.locator('[data-textpreview-state="unsupported"]')
    await unsupported.waitFor({ timeout: 15_000 })
    const unsupportedLine = await unsupported.locator('[data-textpreview-unsupported] p').innerText()
    expect(unsupportedLine).toContain('Preview is not available for this file type yet.')
    expect(await unsupported.locator('[data-textpreview-path]').innerText()).toContain('clip.mp4')
    expect(await unsupported.locator('[data-document-viewer-menu]').count()).toBe(0)
    expect(await unsupported.locator('[data-textpreview-tool="reload"]').count()).toBe(0)
    // The default-application controls land once the Host answered the pinned desktop read.
    const headerOpen = unsupported.locator('[data-open-path-open]')
    await headerOpen.waitFor({ timeout: 15_000 })
    const emptyOpen = unsupported.locator('[data-textpreview-unsupported] [data-open-path-unpreviewable]')
    await emptyOpen.waitFor({ timeout: 15_000 })
    const prominent = unsupported.locator('[data-open-target="file"][data-size="large"]')
    expect((await prominent.boundingBox())?.height).toBe(36)
    expect((await unsupported.locator('[data-open-path]').boundingBox())?.height).toBe(24)
    await successShot(page, 'unsupported')
    sections.push([
      '## Unviewable binary', '',
      '- State: unsupported',
      `- Line: ${unsupportedLine.trim()}`,
      `- Header control has no text: ${String(await headerOpen.innerText() === '')}`,
      `- Empty-state control has text: ${String((await emptyOpen.innerText()).length > 0)}`,
    ].join('\n'))
    if (STUB_OPENER) {
      // Real Host gestures against the stubbed opener: default application from the empty state, reveal from the header menu.
      const clip = join(cwd, 'clip.mp4')
      await emptyOpen.click()
      await expect.poll(async () => (await opened()).length, { timeout: 15_000 }).toBe(1)
      await unsupported.locator('[data-open-path-more]').click()
      await page.getByRole('menuitem', { name: /^Show file location/ }).click()
      await expect.poll(async () => (await opened()).length, { timeout: 15_000 }).toBe(2)
      const gestures = await opened()
      expect(gestures[0]?.action).toBe('open')
      expect([clip, cwd]).toContain(gestures[0]?.path)
      expect(gestures[1]?.action).toBe('reveal')
      expect([clip, cwd]).toContain(gestures[1]?.path)
      if (STUB_OPENER) {
        await expect.poll(() => headerOpen.locator('img').count()).toBe(1)
        await prominent.getByRole('button', { name: 'More ways to open' }).click()
        await page.getByRole('menuitem', { name: 'Test Player (default)', exact: true }).waitFor()
        await compareOrRefreshGolden(join(SNAPSHOT_DIR, 'applications.expected.md'), await page.getByRole('menu').ariaSnapshot(), MODE)
        await page.getByRole('menuitem', { name: 'Other Player', exact: true }).click()
        await expect.poll(async () => (await opened()).length).toBe(3)
        expect((await opened())[2]).toEqual({ path: clip, action: 'application' })
        await headerOpen.click()
        await expect.poll(async () => (await opened()).length).toBe(4)
        expect((await opened())[3]).toEqual({ path: clip, action: 'open' })
        // The reported defect: the Shell lists applications but marks none as the OS default.
        // Clear the OS default marker for this platform: LaunchServices reports it inside the
        // catalog on macOS, while `gio mime` owns it on Linux.
        if (process.platform === 'linux') await writeFile(linuxMimeDefault, '')
        else await writeFile(appsCatalog, JSON.stringify([
          { id: '/Applications/Test Player.app', name: 'Test Player', default: false, icon: `data:image/png;base64,${TINY_PNG.toString('base64')}` },
          { id: '/Applications/Other Player.app', name: 'Other Player', default: false, icon: null },
        ]))
        // Leave the file and come back: the shared association state is discarded when the
        // last control for a path unmounts, so the marker is read again instead of reused.
        await openPreviewFile(column, filesTab, preview, 'notes.unknown')
        await openPreviewFile(column, filesTab, preview, 'clip.mp4')
        await unsupported.waitFor({ timeout: 15_000 })
        await emptyOpen.waitFor({ timeout: 15_000 })
        // Opening the menu settles the re-read association before the labels are compared.
        await prominent.getByRole('button', { name: 'More ways to open' }).click()
        await page.getByRole('menuitem', { name: 'Test Player (default)', exact: true }).waitFor()
        await page.keyboard.press('Escape')
        expect(await emptyOpen.innerText()).toBe('Open')
        expect(await headerOpen.getAttribute('aria-label')).toBe('Open in Test Player')
        await compareOrRefreshGolden(join(SNAPSHOT_DIR, 'applications-no-default.expected.md'), await prominent.ariaSnapshot(), MODE)
        const gesturesBefore = (await opened()).length
        const launchesBefore = (await launched()).length
        await emptyOpen.click()
        await expect.poll(async () => (await opened()).length).toBe(gesturesBefore + 1)
        // Without an OS-marked default the main action opens the application this control
        // names, rather than the OS association (which can prompt or pick another app).
        expect((await opened()).at(-1)).toEqual({ path: clip, action: 'application' })
        await expect.poll(async () => (await launched()).length).toBe(launchesBefore + 1)
        expect((await launched()).at(-1)?.app).toBe(launchTarget)
        await prominent.getByRole('button', { name: 'More ways to open' }).click()
        await page.getByRole('menuitem', { name: 'Test Player (default)', exact: true }).click()
        await expect.poll(async () => (await launched()).length).toBe(launchesBefore + 2)
        expect((await launched()).at(-1)?.app).toBe(launchTarget)
        await expect.poll(async () => (await opened()).length).toBe(gesturesBefore + 2)
        expect((await opened()).at(-1)).toEqual({ path: clip, action: 'application' })
      }
      // Gesture facts stay out of the golden: the stub does not run on Windows.
      expect(await page.getByRole('alert').count()).toBe(0)
    }
    expect(tripwire.pageErrors).toEqual([])
    expect(tripwire.warnings).toEqual([])
    await compareOrRefreshGolden(EXPECTED, sections.join('\n\n'), MODE)
    await assertFixtureInventory(SNAPSHOT_DIR, ['document.expected.md', 'applications.expected.md', 'applications-no-default.expected.md', 'paging.patch.yml'])
  })

  it('preserves Markdown reading position beyond the first page after automatic and manual refresh', async () => {
    onTestFailed(() => saveFailureShot(page, `screenshots/0908-document-preview/refresh-scroll-${process.pid}`))
    if (await page.getByText('LIGHTHOUSE', { exact: true }).count() === 0) {
      const settled = scaffold.whenTurnSettled()
      const input = page.locator('[data-composer-input]').first()
      await input.fill(PROMPT)
      await input.press('Enter')
      await settled
      await page.getByText('LIGHTHOUSE', { exact: true }).waitFor()
    }
    const cwd = scaffold.ctx.agents.list()[0]?.session.header.cwd
    if (cwd === undefined) throw new Error('Session has no workspace cwd')
    const path = join(cwd, 'refresh-scroll.md')
    const markdown = '# Before refresh\n\n' + Array.from({ length: PAGE_LINES * 2 }, (_, index) => `Paragraph ${index + 1}\n`).join('\n')
    await writeFile(path, markdown)
    const column = page.locator('[data-rightbar-col]')
    const expand = page.locator('[data-sidebar-right-expand]')
    if (await expand.isVisible()) await expand.click()
    const filesTab = column.locator('[data-dockkit-tab]').filter({ has: page.getByText('Files', { exact: true }) })
    if (await filesTab.count() === 0) await column.locator('[data-sidebar-right-guide-entry="files"]').click()
    await filesTab.click()
    await column.locator('[data-files-reload]').click()
    const preview = column.locator('[data-textpreview-url]')
    await openPreviewFile(column, filesTab, preview, 'refresh-scroll.md')
    const body = preview.locator('[data-textpreview-body]')
    const heading = body.getByRole('heading', { level: 1 })
    await expect.poll(() => heading.textContent()).toBe('Before refresh')
    await expect.poll(() => preview.locator('[data-textpreview-more]').isEnabled()).toBe(true)
    const target = await body.evaluate(node => node.scrollHeight + 100)
    await scrollForNextPage(body)
    await expect.poll(() => body.evaluate(node => node.scrollHeight - node.clientHeight)).toBeGreaterThan(target)
    await body.evaluate((node, top) => new Promise<void>((resolve) => {
      node.addEventListener('scroll', () => { resolve() }, { once: true })
      node.scrollTop = top
    }), target)
    const original = await body.evaluate(node => node.scrollTop)
    expect(original).toBe(target)
    // Content growing above the viewport keeps the pixel offset instead of following the content.
    await heading.evaluate((node) => { node.style.paddingTop = '300px' })
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    expect(await body.evaluate(node => node.scrollTop)).toBe(original)
    await heading.evaluate((node) => { node.style.paddingTop = '' })

    await writeFile(path, markdown.replace('Before refresh', 'After  refresh'))
    await expect.poll(() => heading.textContent()).toBe('After  refresh')
    await expect.poll(() => body.evaluate((node, top) => Math.abs(node.scrollTop - top), original)).toBeLessThanOrEqual(1)

    const rendered = await heading.elementHandle()
    await preview.locator('[data-textpreview-tool="reload"]').click()
    await expect.poll(() => rendered!.evaluate(node => node.isConnected)).toBe(false)
    await expect.poll(() => heading.textContent()).toBe('After  refresh')
    await expect.poll(() => body.evaluate((node, top) => Math.abs(node.scrollTop - top), original)).toBeLessThanOrEqual(1)
    await rendered!.dispose()
    expect(tripwire.pageErrors).toEqual([])
  })
})
