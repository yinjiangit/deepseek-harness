# AlphaDesk Fork 定制清单

本仓库是 deepseek-harness 的私有 fork，产品身份为 **AlphaDesk**（券商场景：严肃、严谨）。本文件登记所有偏离上游的定制点；每次 `git merge` 上游 `dsh-v*` tag 后，按本清单逐条重放（见 maintain-dsh-fork 技能的 upstream-sync 工作流）。

品牌规范：

- 标志：几何大写 A + 突破横杠（双腿 `M12 40 L22.5 8 L33 40`，横杠 `M16.3 29.5 H36`，stroke 4.8，viewBox 48×48）。
- 主色（AlphaDesk navy）：`rgb(23, 64, 113)`（light 500 档）；dark 主题强调色 `rgb(126, 161, 216)` 起。
- 点缀金：`rgb(164, 128, 56)`（light）/ `rgb(196, 165, 94)`（dark），CSS 变量 `--dsh-brand-accent`。
- 品牌字体：平台系统字体栈（不再使用 Montserrat）。
- 品牌位由上游 `packages/client/ui-brand-official` 承载（标记/名称/会话欢迎位），fork 不替换该插件。原 `ui-brand-alphadesk` 的 navy 配色表与点缀金变量已于 2026-10-19 随插件移除，界面配色回归上游默认。

## 阶段一：Web 端（已完成，2026-10-18）

2026-10-19 移除 `ui-brand-alphadesk` 插件：品牌位回归上游 `ui-brand-official`，产品改名（标题/图标/locale/资产）全部保留。

上游同步重放顺序：先恢复本清单新增文件（永不冲突），再核对下列修改点。

### 新增（fork 自有，直接保留）

| 路径 | 内容 |
|---|---|
| `FORK.md` | 本清单 |

### 修改（同步时逐条重放）

| 路径 | 改动 |
|---|---|
| `apps/web/index.html` | `<title>` → `AlphaDesk` |
| `apps/web/vite.config.ts` | `DEFAULT_CLIENT_TITLE` → `'AlphaDesk'`；`transformIndexHtml` 的替换字面量同步改为 `<title>AlphaDesk</title>` |
| `apps/web/public/manifest.webmanifest` | `name`/`short_name` → `AlphaDesk` |
| `apps/web/public/favicon.svg` | 替换为 AlphaDesk 标志（stroke `#174071`） |
| `apps/web/public/favicon-dark.svg` | 同上（stroke `#9CB4D8`；两文件仅颜色不同） |
| `packages/client/locale/src/locales/en.ts` | `brand.localBuild` → `AlphaDesk Local Build` |
| `packages/client/locale/src/locales/zh.ts` | `brand.localBuild` → `AlphaDesk 本地构建` |
| `packages/client/ui-conversation/src/client/locales.ts` | `hero.headline`：zh `严谨专业 · 行稳致远`、en `Precision and Discipline` |
| `scripts/verify-repository-references.ts` | `excludedPrefixes` 增加 `python/sdk/uv.lock`（生成 lockfile 的哈希与本机 git 对象前缀撞车的误报，与 `vendor/` 同理豁免） |
| `.gitignore` | 忽略 `.agents/skills/maintain-dsh-fork/`（本机技能工具的项目级镜像，内含嵌套 dsh-plugin-guide git 克隆，不进版本库；正本在 `~/.zcode/skills/maintain-dsh-fork`，两处随每次「更新技能」同步）与 `skill-dist/`（技能包产物目录：只保留最新 `maintain-dsh-fork-v<version>.zip`，二进制不进版本库；打包与版本约定见该技能 SKILL.md「技能自更新」第 4 步） |
| `scripts/verify-md-links.ts` | `markdownLinkSourcePaths` 排除谓词跳过 `.agents/skills/maintain-dsh-fork/`（镜像语料的相对链接在其源仓库解析） |
| `scripts/project-doc-site.spec.ts` | 「real path escapes the repository」用例 `it.skipIf(process.platform === 'win32')`（建文件符号链接需 Windows 开发者模式，沿用仓内既有的 win32 skip 惯例） |
| 生成物（重生成勿手改） | `docs/module-graph*.md`（gen-module-graph）、`docs/config-catalog*.md`（gen-config-catalog）、`packages/extensions/cordis-client-runner/src/client/slot-catalog.ts`（gen-client-catalog）、`packages/preset/agent-preset/skills/cordis-composition-reference/references/packages.md`（gen-plugin-packages） |
| `apps/web/tests/pwa-manifest.e2e.ts` | manifest/favicon 断言改为 AlphaDesk 预期 |
| `packages/client/ui-sidebar/tests/sidebar-root.client.spec.tsx` | `DSH Local Build` 断言 → `AlphaDesk Local Build`（3 处） |
| `packages/client/ui-sidebar/tests/__snapshots__/sidebar-snapshot.client.spec.tsx.snap` | 快照文案英中两处同步 |
| `packages/client/ui-conversation/tests/skeleton.client.spec.tsx` | hero 口号断言英中同步（3+1 处） |

### 同步后最小检查

`pnpm install` → `pnpm run typecheck` → `pnpm run test -t sidebar` → `pnpm run build:artifacts` → 起一次 `pnpm dsh web` 目检品牌位与配色。

### 常用命令（本机）

本机 pnpm 通过 corepack 提供：`COREPACK_ENABLE_DOWNLOAD_PROMPT=0 corepack pnpm <script>`。

## 阶段二：Desktop 端（已完成，2026-10-18）

### 新增（fork 自有）

| 路径 | 内容 |
|---|---|
| `apps/desktop/scripts/gen-alphadesk-assets.mjs` | 资产生成器：navy tile + A 标志 → 双平台图标 PNG/SVG、安装器品牌图、welcome 字标（sharp 栅格化）；改几何后重跑 `pnpm exec tsx scripts/gen-alphadesk-assets.mjs` + `pnpm run render:tray-icon` |

### 修改（同步时逐条重放）

| 路径 | 改动 |
|---|---|
| `scripts/client-build-environment.ts` | `OFFICIAL_CLIENT_BUILD_ENVIRONMENT.DSH_CLIENT_TITLE` → `'AlphaDesk'`（桌面打包强制标题） |
| `apps/desktop/src/locale.ts` | 全部产品名 → `AlphaDesk`；welcome 口号 → `Precision and discipline for the desk.` / `严谨专业，行稳致远`；地址占用文案的产品缩写 → AlphaDesk（`dsh` CLI 功能词保留） |
| `apps/desktop/src/main.ts` | `applicationName` → `AlphaDesk` |
| `apps/desktop/scripts/electron-builder-config.mjs` | `productName`/协议名/麦克风描述 → AlphaDesk（URL scheme 仍为 `dsh`，功能面不动） |
| `apps/desktop/scripts/desktop-package-environment.mjs` 及其 spec | 未签名构建默认 appId → `com.alphadesk.app`（更新资格测试的 `com.deepseek.dsh.qualification.*` 内部身份不动） |
| `apps/desktop/scripts/{package-macos,package-target,smoke-packaged-runtime,verify-retained-desktop,development-app}.ts(mjs)` | 产物路径/Bundle 名 → `AlphaDesk.app/.exe`；`CFBundleURLName` → AlphaDesk |
| `apps/desktop/scripts/command-path.ps1` | 注册表键 → `Software\AlphaDesk\Command`；互斥锁 → `AlphaDesk.Command` |
| `apps/desktop/scripts/render-tray-icon.ts` | tray 放大锚点 → `(512,512)`（跟随新标志几何） |
| `apps/desktop/installer/strings.nsh` + `extract-report.h` | NSIS 双语产品名、提取失败报告 → AlphaDesk |
| `apps/desktop/cli/dsh`、`dsh.cmd`、`electron-builder.config.d.mts` | 启动器可执行名 → `AlphaDesk(.exe)`；d.mts 协议类型注释同步 |
| `apps/desktop/renderer/welcome.css` | `--dsw-font-family-brand` 去 Montserrat，跟随系统栈 |
| `apps/desktop/resources/`、`installer/assets/`、`renderer/assets/welcome-brand.svg` | 全部品牌二进制/SVG 用生成器重制 |
| `apps/cli/src/{args,plugin}.ts` + `docs/cli-help*.md` | CLI 帮助/徽章产品名 → AlphaDesk；`docs/cli-help*.md` 由 `pnpm run gen-cli-help` 重生成 |
| `packages/client/ui-settings-account/src/client/locales{.ts,/onboarding.ts}` | 桌面引导/账号页产品名 → AlphaDesk |
| `packages/context/harness-dev-context/src/index.ts` | 模型可见 runtime-context 提示中的产品名 → AlphaDesk（模型可见 ⟺ 已记日志；其 spec 与 web 期望同 PR 更新） |
| 测试期望 | `apps/desktop/tests/**`（expected JSON/txt + 快照 `-u`）、`apps/web/tests/expected/**`、`apps/web/tests/{scaffold,assembled-boot}.ts`、`fixtures/assembled-remote.fixture.json`、`built-boot.expected.e2e.ts`（品牌位断言保留上游 official/local 分支，仅 locale 文案随改名）机械同步 |

### 阶段二验证记录（2026-10-18）

- `vitest run packages/context/harness-dev-context packages/client/ui-settings-account`：395 通过
- `vitest run apps/desktop`：155 文件；除 5 个环境限制文件外全过（windows-cli-signals 需本机 Electron 二进制、upload-with-credentials 需 pwsh 7、windows-signature-* 签名枚举超时——均与品牌无关）；fatal-recovery/welcome-renderer 快照 `-u` 后重跑全过
- `vitest.expected.config.ts`、`vitest.web.config.ts` built-boot、`verify-cli-help`：通过
- 浏览器 e2e（desktop-onboarding 等）需 Playwright Chromium，本机网络受限时另行验证

## 构建流水线（fork 自有，2026-10-19）

| 路径 | 改动 |
|---|---|
| `pnpm-workspace.yaml` | 末尾追加 `verifyDepsBeforeRun: false`。366 个 workspace 项目下，`pnpm run` 前的隐式 install 实测耗时 10 分 43 秒，且掩盖 lockfile 与 node_modules 的漂移；改为显式 `pnpm install`（换依赖后必须手动执行）。上游同步时重放该键。 |

## Windows 打包环境（本机，2026-10-21）

运行 `package:desktop:win:x64:unsigned` 前设置下列环境；它们不写进仓库配置，因为只适用于本机（Git Bash 的 tar 语义、国内镜像可达性）。

| 设置 | 原因 |
|---|---|
| `PATH="/c/WINDOWS/system32:$PATH"` | `apps/desktop/scripts/prepare-package-set.ts:91` 用 `tar -xOzf <绝对路径>` 读取 tarball 清单。Git Bash 的 GNU tar 1.35 把 `C:` 解释为远程主机（`tar (child): Cannot connect to C: resolve failed`），Windows 自带的 bsdtar 3.8 正常。把 System32 前置让 `tar` 解析到 bsdtar，无需改上游源码。 |
| `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/` | 直连 GitHub Releases 不可达；`@electron/get` 读取该变量。首次下载 148 MB 实测约 31 分钟。 |
| `ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/` | electron-builder 的 NSIS 等二进制同理。 |
| `COREPACK_ENABLE_DOWNLOAD_PROMPT=0` | 本机 pnpm 由 corepack 提供。 |

已知环境限制（非代码缺陷）：`scripts/primary-runtime/prepare.ts:263` 的 Python 冒烟检查用硬编码 120 秒超时；本机 `import pandas` 冷启动约 60 秒、热缓存约 40 秒，三项连续调用逼近上限，可能以 `ETIMEDOUT` 失败。失败只发生在验证步骤，payload 资源此前已就绪；重跑前先手动预热 runtime 的 Python（连续执行两次导入）可提高通过率。

### 阻塞：Electron 44.7.0 在本机无法写文件（2026-10-21）

本机 Electron 44.7.0 以 `ELECTRON_RUN_AS_NODE=1` 运行时不具备写权限：`fs.mkdirSync` 与 `fs.writeFileSync` 对 `%TEMP%` 下任意路径都返回 `EPERM`，读操作正常。同一台机器上用普通 Node 24.18 执行相同调用成功，因此这不是路径、权限或杀软问题（Defender 实时保护处于关闭状态），也不是工具沙箱。

失败点是 `apps/desktop/scripts/prepare-dsh.ts` 的 `runtime:reset` 之后：它用 Electron 作为 Node 运行器执行 runtime 里的 pnpm（`--config.store-dir=<临时目录>/store`），pnpm 建 `store/v11` 时即报 `EPERM`。前面三个阶段在本机已能完整通过：`build:official`、`release:pack`（345 个 dsh tarball）、`prepare:runtime`、`prepare:packages`。

复现与判定：

```sh
# 失败
ELECTRON_RUN_AS_NODE=1 <runtime>/electron/electron.exe -e \
  "require('fs').mkdirSync(process.argv[1],{recursive:true})" "$TEMP/x"
# 成功
node -e "require('fs').mkdirSync(process.argv[1],{recursive:true})" "$TEMP/x"
```

未验证的规避方向（都需要独立环境确认，不宜在 fork 上直接改上游脚本）：在能正常写文件的 Windows（非 10.0.26340 预览版）上打包；或升级 `electron` 到已修复该行为的版本后重跑。安装器产物在本机因此无法生成。

## 已知残留（按设计保留）

- `docs/**` 叙述文档仍用 "DeepSeek Harness" 指代本项目（fork 文档策略：避开高频冲突区的大面积替换；产品面已全部改名）
- `DSH_CLIENT_*` 环境变量名、`dsh` CLI 名、`dsh://` URL scheme、npm 包名 `@deepseek-ai/*`：功能标识符，不改
- 功能性文案中的 DeepSeek 模型/账号/搜索引用（ui-settings-account 登录描述等）保留
