/**
 * AlphaDesk Web 分发包构建器。
 *
 * 打出一个不依赖源码仓库、不需要 pnpm 的离线目录：
 *
 * ```text
 * packed/dsh/*.tgz       Web 闭包内的 `@deepseek-ai/dsh-*` 包
 * packed/vendor/*.tgz    闭包内的 vendor 包（Cordis 框架等）
 * install.* / start.*    安装与启动脚本
 * scripts/              安装清单生成器
 * ```
 *
 * 闭包从 shipped profile 的 bundle 列表与 `@deepseek-ai/dsh` CLI 出发，沿
 * `dependencies` / `peerDependencies` / `optionalDependencies` 求传递闭包。这与
 * `scripts/verify-product-use.ts` 使用的可达性口径一致，因此分发包不会带上默认
 * 组合永远挂载不到的包。
 *
 * 用法：
 *
 * ```sh
 * tsx scripts/alphadesk-web-dist.ts [--out <dir>] [--profile web]
 * ```
 *
 * 前提：先跑 `pnpm run build:artifacts`——分发包打的是每个包 `files` 字段选中的
 * `lib/` 产物。构建之前 `lib/` 不存在，`pnpm pack` 会产出空 tarball。
 * @module
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { execFileSync } from 'node:child_process'
import { PROFILE_TEMPLATES } from '../packages/util/official-bundles/src/bundles.ts'
import { pnpmCommand } from './release/process.ts'
import { closureOf, partitionByFamily, singleVersion, type WorkspacePackage } from './alphadesk-web-packages.ts'

const ROOT = resolve(import.meta.dirname, '..')
const DEFAULT_OUT = resolve(ROOT, '../alphadesk-web-dist')

/**
 * 读取全部 workspace 包的清单。
 *
 * 包固定位于 `<group>/<package>/package.json` 两层深处，`group` 是 packages /
 * apps / vendor 下的一级目录；apps 的包只有一层，也一并兼容。
 * @returns 包名到清单信息的映射。
 */
function readWorkspace(): Map<string, WorkspacePackage> {
  const packages = new Map<string, WorkspacePackage>()
  const containers = ['packages', 'apps', 'vendor'] as const
  for (const container of containers) {
    const containerRoot = join(ROOT, container)
    if (!existsSync(containerRoot)) continue
    const candidates: string[] = []
    for (const group of readdirSync(containerRoot, { withFileTypes: true })) {
      if (!group.isDirectory()) continue
      const groupPath = join(containerRoot, group.name)
      candidates.push(groupPath)
      for (const child of readdirSync(groupPath, { withFileTypes: true })) {
        if (child.isDirectory()) candidates.push(join(groupPath, child.name))
      }
    }
    for (const directory of candidates) {
      const manifestPath = join(directory, 'package.json')
      if (!existsSync(manifestPath)) continue
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>
      const name = manifest.name
      if (typeof name !== 'string' || name === '') continue
      packages.set(name, { name, directory, manifest })
    }
  }
  return packages
}

/**
 * 运行一个命令并把标准输出回传。
 * @param command - 可执行文件。
 * @param args - 参数。
 * @param cwd - 工作目录。
 * @returns 标准输出。
 */
function run(command: string, args: readonly string[], cwd: string): string {
  return execFileSync(command, [...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
}

/**
 * 用 pnpm 打一个包的 tarball。
 *
 * `pnpmCommand()` 解析到 pnpm 的 JavaScript 入口；Windows 上直接 spawn 裸
 * `pnpm` 会命中 .cmd shim 而失败。
 * @param entry - workspace 包。
 * @param destination - 输出目录。
 */
function packOne(entry: WorkspacePackage, destination: string): void {
  const [command, ...prefix] = pnpmCommand()
  run(command, [...prefix, '--dir', entry.directory, 'pack', '--pack-destination', destination], ROOT)
}

/**
 * 写安装清单生成器（安装时按 tarball 生成 app/package.json）。
 * @param out - 分发根目录。
 */
function writeManifestScript(out: string): void {
  const script = `/**
 * 由 packed/ 里的 tarball 生成 app/package.json（全部依赖用 file: 指向本地包）。
 * @param argv - [packedRoot, appRoot]
 */
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'

const [packedRoot, appRoot] = process.argv.slice(2)
if (packedRoot === undefined || appRoot === undefined) {
  throw new Error('usage: make-manifest.mjs <packed-dir> <app-dir>')
}
const packed = resolve(packedRoot)
const app = resolve(appRoot)
mkdirSync(app, { recursive: true })

/** Windows 的 GNU tar 把盘符路径当远程主机，因此在归档所在目录跑并传裸成员名。 */
function identity(directory, filename) {
  const manifest = JSON.parse(execFileSync('tar', ['-xOzf', filename, 'package/package.json'], { cwd: directory, encoding: 'utf8' }))
  if (typeof manifest.name !== 'string' || typeof manifest.version !== 'string') throw new Error(filename + ' has no name/version')
  return manifest
}

const dependencies = {}
let count = 0
// Relative specifiers, never file: URLs: a distribution path may contain
// characters (spaces, parentheses) that npm's URL handling would percent-encode
// into a path it then cannot open. app/ and packed/ stay siblings.
for (const family of ['dsh', 'vendor']) {
  const directory = join(packed, family)
  for (const filename of readdirSync(directory).filter(name => name.endsWith('.tgz')).sort()) {
    const manifest = identity(directory, filename)
    const relativePath = relative(app, join(directory, filename)).replaceAll('\\\\', '/')
    dependencies[manifest.name] = 'file:' + relativePath
    count += 1
  }
}

writeFileSync(join(app, 'package.json'), JSON.stringify({
  name: 'alphadesk-web', version: '0.0.0', private: true,
  description: 'AlphaDesk Web runtime installed from packed tarballs',
  dependencies,
}, null, 2) + '\\n')
console.log('make-manifest: wrote ' + join(app, 'package.json') + ' with ' + count + ' tarball dependencies')
`
  mkdirSync(join(out, 'scripts'), { recursive: true })
  writeFileSync(join(out, 'scripts', 'make-manifest.mjs'), script)
}

/**
 * 写 PowerShell 安装脚本。
 * @param out - 分发根目录。
 */
function writeInstallPs1(out: string): void {
  writeFileSync(join(out, 'install.ps1'), `# AlphaDesk Web: 把 packed 里的 tarball 装进 .\\app，然后提示启动。
#
# 运行时需要的一切都在 .\\packed 里。唯一的联网行为是 npm 解析第三方依赖
# （esbuild、react 等）；-Offline 让缓存未命中时直接失败而不是访问源。
[CmdletBinding()]
param(
  [switch]$Offline,
  [string]$Registry = 'https://registry.npmmirror.com'
)

$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$app = Join-Path $here 'app'
$packed = Join-Path $here 'packed'

if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'install.ps1: 需要 Node.js 22.19+ 或 24+' }
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { throw 'install.ps1: 需要 npm（随 Node.js 提供）' }
$major = [int](& node -p 'process.versions.node.split(".")[0]')
if ($major -lt 22) { throw "install.ps1: 需要 Node.js 22.19+ 或 24+；当前 $(& node --version)" }

$dshCount = (Get-ChildItem (Join-Path $packed 'dsh') -Filter *.tgz).Count
$vendorCount = (Get-ChildItem (Join-Path $packed 'vendor') -Filter *.tgz).Count
Write-Host "AlphaDesk Web: 由 $dshCount 个 dsh 与 $vendorCount 个 vendor tarball 生成 $app\\package.json"

& node (Join-Path $here 'scripts\\make-manifest.mjs') $packed $app
if ($LASTEXITCODE -ne 0) { throw 'install.ps1: 清单生成失败' }

Push-Location $app
try {
  Write-Host "AlphaDesk Web: 安装依赖（源 $Registry）"
  $npmArgs = @('install', '--no-audit', '--no-fund', '--registry', $Registry)
  if ($Offline) { $npmArgs += '--offline' }
  & npm @npmArgs
  if ($LASTEXITCODE -ne 0) { throw 'install.ps1: npm install 失败' }
}
finally {
  Pop-Location
}

Write-Host ''
Write-Host 'AlphaDesk Web: 安装完成。启动：'
Write-Host "  $here\\start.ps1"
`)
}

/**
 * 写 PowerShell 启动脚本。
 * @param out - 分发根目录。
 */
function writeStartPs1(out: string): void {
  writeFileSync(join(out, 'start.ps1'), `# AlphaDesk Web: 从已安装的 .\\app 启动浏览器界面。
#
# 用普通 Node 跑 CLI；不需要构建、不需要 pnpm、不需要源码。
# 额外参数透传给 \`dsh web\`（例如 -Port 8080 或 -NoOpen）。
param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$Arguments
)

$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$app = Join-Path $here 'app'

if (-not (Test-Path (Join-Path $app 'node_modules'))) {
  throw "start.ps1: 缺少 $app\\node_modules；请先运行 $here\\install.ps1"
}

if (-not $env:DSH_HOME) { $env:DSH_HOME = Join-Path $app '.dsh' }

& node (Join-Path $app 'node_modules\\@deepseek-ai\\dsh\\lib\\bin.js') web @Arguments
`)
}

/**
 * 写 sh 版安装与启动脚本。
 * @param out - 分发根目录。
 */
function writeShellScripts(out: string): void {
  writeFileSync(join(out, 'install.sh'), `#!/usr/bin/env bash
# AlphaDesk Web：把 packed 里的 tarball 装进 ./app。
set -euo pipefail
cd "$(dirname "$0")"
REGISTRY="\${REGISTRY:-https://registry.npmmirror.com}"
OFFLINE="\${OFFLINE:-}"

command -v node >/dev/null || { echo "install.sh: 需要 Node.js 22.19+ 或 24+" >&2; exit 1; }
command -v npm  >/dev/null || { echo "install.sh: 需要 npm（随 Node.js 提供）" >&2; exit 1; }

node scripts/make-manifest.mjs packed app

cd app
ARGS=(install --no-audit --no-fund --registry "$REGISTRY")
[ -n "$OFFLINE" ] && ARGS+=(--offline)
npm "\${ARGS[@]}"
echo
echo "AlphaDesk Web：安装完成。启动：$(cd .. && pwd)/start.sh"
`)
  writeFileSync(join(out, 'start.sh'), `#!/usr/bin/env bash
# AlphaDesk Web：从已安装的 ./app 启动浏览器界面。参数透传给 \`dsh web\`。
set -euo pipefail
cd "$(dirname "$0")"
[ -d app/node_modules ] || { echo "start.sh：缺少 app/node_modules；请先运行 ./install.sh" >&2; exit 1; }
export DSH_HOME="\${DSH_HOME:-$PWD/app/.dsh}"
exec node app/node_modules/@deepseek-ai/dsh/lib/bin.js web "$@"
`)
}

/**
 * 写分发包 README。
 * @param out - 分发根目录。
 * @param version - 产品版本。
 * @param dshCount - dsh tarball 数。
 * @param vendorCount - vendor tarball 数。
 */
function writeReadme(out: string, version: string, dshCount: number, vendorCount: number): void {
  writeFileSync(join(out, 'README.md'), `# AlphaDesk Web 分发包

离线 Web 客户端分发包。解压后装一次依赖，然后启动。

## 环境要求

- **Node.js 22.19+ 或 24+**
- **npm**（随 Node.js 提供）
- 约 1 GB 磁盘空间

不需要 pnpm、不需要构建工具、不需要源码仓库。

## 快速开始

### Windows（PowerShell）

\`\`\`powershell
.\\install.ps1
.\\start.ps1
\`\`\`

### macOS / Linux

\`\`\`bash
chmod +x install.sh start.sh
./install.sh
./start.sh
\`\`\`

启动后终端会打印带 token 的地址，浏览器一般会自动打开。首次打开会做一次 303 跳转并写入登录 cookie，属正常现象。

## 常用参数

启动脚本把参数透传给 \`dsh web\`：

| 目的 | Windows | macOS / Linux |
|---|---|---|
| 换端口 | \`.\\start.ps1 -Port 8080\` | \`./start.sh --port 8080\` |
| 不自动开浏览器 | \`.\\start.ps1 -NoOpen\` | \`./start.sh --no-open\` |
| 只监听本机 | \`.\\start.ps1 -Host 127.0.0.1\` | \`./start.sh --host 127.0.0.1\` |

安装脚本参数：

| 目的 | Windows | macOS / Linux |
|---|---|---|
| 换 npm 源 | \`-Registry https://registry.npmjs.org\` | \`REGISTRY=https://registry.npmjs.org ./install.sh\` |
| 强制离线 | \`-Offline\` | \`OFFLINE=1 ./install.sh\` |

## 目录结构

\`\`\`
alphadesk-web-dist/
  packed/dsh/      ${dshCount} 个 @deepseek-ai/dsh-* 包（含 Web 前端静态资源）
  packed/vendor/   ${vendorCount} 个 vendor 包（Cordis 框架等）
  scripts/         安装清单生成器
  install.*        生成 app/package.json 并执行 npm install
  start.*          用纯 Node 启动 CLI 的 web 命令
  app/             安装产物（可删掉重装）
\`\`\`

运行时数据默认写在 \`app/.dsh\`；用 \`DSH_HOME\` 可以改到别处。

## 配置

- **模型 API key**：首次启动后在界面里配置，或用环境变量 \`DEEPSEEK_API_KEY\`。
- **MCP 服务器**：在 \`$DSH_HOME/profiles/web/cordis.patch.yml\` 里启用 \`mcp-server\` 行（分发包默认禁用）。示例见该文件注释。
- **依赖安装要联网**：\`packed/\` 只含 AlphaDesk 自己的包，第三方依赖（React、esbuild 等）由 npm 解析。默认 npmmirror。

## 版本

AlphaDesk fork（\`fork/alphadesk\`），产品版本 \`${version}\`。
`)
}

/**
 * 构建一个 profile 的 Web 分发包。
 *
 * 闭包从两个根出发：目标 profile 的 bundle 列表，以及 `@deepseek-ai/dsh` CLI。
 *
 * CLI 把全部五个 shipped bundle 都列为硬依赖，因此 `dsh` 的闭包天然包含
 * acp / headless / sdk / sdk-minimal 四个 profile 的插件。这不是可选清理项：
 * npm 安装时会按 `dsh` 的 dependencies 强制装齐，分发包若少了它们，安装直接
 * 失败。真要裁掉，得先改 `apps/cli` 的依赖分节（见 FORK.md「下一轮候选」），
 * 那是另一处改动，不属于分发包构建。
 * @param options - 输出目录与 profile 名。
 */
function build(options: { out: string; profile: string }): void {
  const packages = readWorkspace()
  const template = PROFILE_TEMPLATES[options.profile]
  if (template === undefined) throw new Error(`unknown shipped profile ${options.profile}`)
  const roots = [...template.bundles, '@deepseek-ai/dsh']
  const closure = closureOf(roots, packages)
  const { dsh: dshMembers, vendor: vendorMembers } = partitionByFamily(closure, packages, ROOT)
  if (dshMembers.length === 0) throw new Error('closure produced no dsh packages')
  if (vendorMembers.length === 0) throw new Error('closure produced no vendor packages')

  const dshDirectory = join(options.out, 'packed', 'dsh')
  const vendorDirectory = join(options.out, 'packed', 'vendor')
  rmSync(dshDirectory, { recursive: true, force: true })
  rmSync(vendorDirectory, { recursive: true, force: true })
  mkdirSync(dshDirectory, { recursive: true })
  mkdirSync(vendorDirectory, { recursive: true })

  console.log(`alphadesk-web-dist: ${dshMembers.length} dsh + ${vendorMembers.length} vendor package(s)`)
  for (const entry of dshMembers) packOne(entry, dshDirectory)
  for (const entry of vendorMembers) packOne(entry, vendorDirectory)

  const version = singleVersion(dshMembers)

  writeManifestScript(options.out)
  writeInstallPs1(options.out)
  writeStartPs1(options.out)
  writeShellScripts(options.out)
  writeReadme(options.out, version, dshMembers.length, vendorMembers.length)
  console.log(`alphadesk-web-dist: wrote ${options.out} (version ${version})`)
}

const { values } = parseArgs({
  options: { out: { type: 'string' }, profile: { type: 'string', default: 'web' } },
  allowPositionals: false,
})
build({ out: resolve(values.out ?? DEFAULT_OUT), profile: values.profile })
