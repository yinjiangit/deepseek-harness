# AlphaDesk Fork 定制清单

本仓库是 deepseek-harness 的私有 fork，产品身份为 **AlphaDesk**（券商场景：严肃、严谨）。本文件登记所有偏离上游的定制点；每次 `git merge` 上游 `dsh-v*` tag 后，按本清单逐条重放（见 maintain-dsh-fork 技能的 upstream-sync 工作流）。

品牌规范：

- 标志：几何大写 A + 突破横杠（双腿 `M12 40 L22.5 8 L33 40`，横杠 `M16.3 29.5 H36`，stroke 4.8，viewBox 48×48）。
- 主色（AlphaDesk navy）：`rgb(23, 64, 113)`（light 500 档）；dark 主题强调色 `rgb(126, 161, 216)` 起。
- 点缀金：`rgb(164, 128, 56)`（light）/ `rgb(196, 165, 94)`（dark），CSS 变量 `--dsh-brand-accent`。
- 品牌字体：平台系统字体栈（不再使用 Montserrat）。
- 品牌位由自有插件 `packages/client/ui-brand-alphadesk` 提供（标记/名称/会话欢迎位/配色表），所有构建 profile 无条件注册。

## 阶段一：Web 端（已完成，2026-10-18）

上游同步重放顺序：先恢复本清单新增文件（永不冲突），再核对下列修改点。

### 新增（fork 自有，直接保留）

| 路径 | 内容 |
|---|---|
| `packages/client/ui-brand-alphadesk/` | AlphaDesk 品牌插件包：侧栏 mark/name、会话欢迎位 mark、navy 配色表（覆盖 `--dsw-static-deepseek-*` 尺度与 `--dsw-font-family-brand`）、单测、双语 README |
| `FORK.md` | 本清单 |

### 修改（同步时逐条重放）

| 路径 | 改动 |
|---|---|
| `packages/bundle/web-app/cordis.patch.yml` | 花名册行 `ui-brand-official` → `ui-brand-alphadesk`（含注释） |
| `packages/bundle/web-app/package.json` | dependencies 中 `…ui-brand-official` → `…ui-brand-alphadesk` |
| `apps/web/index.html` | `<title>` → `AlphaDesk` |
| `apps/web/vite.config.ts` | `DEFAULT_CLIENT_TITLE` → `'AlphaDesk'`；`transformIndexHtml` 的替换字面量同步改为 `<title>AlphaDesk</title>` |
| `apps/web/public/manifest.webmanifest` | `name`/`short_name` → `AlphaDesk` |
| `apps/web/public/favicon.svg` | 替换为 AlphaDesk 标志（stroke `#174071`） |
| `apps/web/public/favicon-dark.svg` | 同上（stroke `#9CB4D8`；两文件仅颜色不同） |
| `packages/client/locale/src/locales/en.ts` | `brand.localBuild` → `AlphaDesk Local Build` |
| `packages/client/locale/src/locales/zh.ts` | `brand.localBuild` → `AlphaDesk 本地构建` |
| `packages/client/ui-conversation/src/client/locales.ts` | `hero.headline`：zh `严谨专业 · 行稳致远`、en `Precision and Discipline` |
| `scripts/verify-package-readme-model-experience.ts` | 新增 `packages/client/ui-brand-alphadesk` 分类行（kind `none`） |
| `tsconfig.base.json` | paths 新增 `@deepseek-ai/dsh-client-ui-brand-alphadesk` → `./packages/client/ui-brand-alphadesk/src` |
| `tsconfig.client.json` | references 新增 `{ "path": "./packages/client/ui-brand-alphadesk" }` |
| `scripts/verify-repository-references.ts` | `excludedPrefixes` 增加 `python/sdk/uv.lock`（生成 lockfile 的哈希与本机 git 对象前缀撞车的误报，与 `vendor/` 同理豁免） |
| `.gitignore` | 忽略 `.agents/skills/maintain-dsh-fork/`（本机技能工具，内含嵌套 dsh-plugin-guide git 克隆，不进版本库；正本在 `~/.zcode/skills/maintain-dsh-fork`） |
| `scripts/verify-md-links.ts` | `markdownLinkSourcePaths` 排除谓词跳过 `.agents/skills/maintain-dsh-fork/`（镜像语料的相对链接在其源仓库解析） |
| `scripts/project-doc-site.spec.ts` | 「real path escapes the repository」用例 `it.skipIf(process.platform === 'win32')`（建文件符号链接需 Windows 开发者模式，沿用仓内既有的 win32 skip 惯例） |
| 生成物（重生成勿手改） | `docs/module-graph*.md`（gen-module-graph）、`docs/config-catalog*.md`（gen-config-catalog）、`packages/extensions/cordis-client-runner/src/client/slot-catalog.ts`（gen-client-catalog）、`packages/preset/agent-preset/skills/cordis-composition-reference/references/packages.md`（gen-plugin-packages） |
| `apps/web/tests/pwa-manifest.e2e.ts` | manifest/favicon 断言改为 AlphaDesk 预期 |
| `packages/client/ui-sidebar/tests/sidebar-root.client.spec.tsx` | `DSH Local Build` 断言 → `AlphaDesk Local Build`（3 处） |
| `packages/client/ui-sidebar/tests/__snapshots__/sidebar-snapshot.client.spec.tsx.snap` | 快照文案英中两处同步 |
| `packages/client/ui-conversation/tests/skeleton.client.spec.tsx` | hero 口号断言英中同步（3+1 处） |
| `packages/client/ui-brand-alphadesk/README.i18n.yaml` | 编辑双语 README 后用 `pnpm run verify-translation-pairing --write packages/client/ui-brand-alphadesk/README.md` 重录 |

### 同步后最小检查

`pnpm install` → `pnpm run typecheck` → `pnpm --filter @deepseek-ai/dsh-client-ui-brand-alphadesk test`（或在根 `pnpm run test -t alphadesk`）→ `pnpm run build:artifacts` → 起一次 `pnpm dsh web` 目检品牌位与配色。

### 常用命令（本机）

本机 pnpm 通过 corepack 提供：`COREPACK_ENABLE_DOWNLOAD_PROMPT=0 corepack pnpm <script>`。

## 阶段二：Desktop 端（待做）

Web 端效果确认后实施；锚点已勘察：

- `scripts/client-build-environment.ts` `OFFICIAL_CLIENT_BUILD_ENVIRONMENT.DSH_CLIENT_TITLE`：桌面打包强制标题，改为 `AlphaDesk`（当前 `DeepSeek Harness`，否则安装器静默回官方名）。
- `apps/desktop/src/locale.ts`（菜单/About/退出确认的全部 `DeepSeek Harness` 字样）。
- `apps/desktop/installer/strings.nsh`（NSIS 英文/简中文案）。
- `apps/desktop/scripts/electron-builder-config.mjs`（productName/协议/appId/产物命名）与 `apps/desktop/src/main.ts` 的 applicationName。
- `apps/desktop/resources/` 7 个图标文件与 `apps/desktop/installer/assets/` 品牌图、`apps/desktop/renderer/assets/welcome-brand.svg`：用 AlphaDesk 标志重制（macOS/Windows 各规格）。
- `apps/desktop/renderer/welcome.css`：内嵌 `Montserrat` 品牌字体引用，改跟随系统栈。

## 功能性残留（非品牌暴露，按需处理）

以下字符串引用 DeepSeek 平台账号/模型 API/搜索服务本身，属功能语义，未改动：

- `packages/client/ui-settings-account/locale/zh.json`（DeepSeek 登录描述）
- `packages/client/ui-settings-session-log/locale/zh.json`、`packages/client/ui-settings-web-search/locale/zh.json`
- `apps/web/tests/scaffold.ts` 的 bonus-notice 公告正文（DeepSeek 0.2 预览公告；券商分发可考虑整体禁用该 notice 面板）。
