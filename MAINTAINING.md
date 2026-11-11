# AlphaDesk 维护手册

这是 AlphaDesk fork 的**操作指引**：如何跟随上游、如何出包、如何改功能。
「改了什么、为什么改」的账本在 [FORK.md](FORK.md)。

---

## 1. 项目定位

AlphaDesk 是 [deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) 的私有 fork。

| 项 | 值 |
|---|---|
| 上游 | `https://github.com/deepseek-ai/deepseek-harness.git`（remote `upstream`） |
| 本仓 | `https://github.com/yinjiangit/deepseek-harness.git`（remote `origin`） |
| 工作分支 | `fork/alphadesk` |
| 当前基线 | `dsh-v0.2.2-rc.1` |
| 版本号 | 由根 `package.json` 单点驱动 |

**产品面**：对话、工具调用、MCP、技能、文件读写。不含：插件管理、子代理、工作流、定时任务、目标、计划模式、Cordis 自改、遥测、账号登录、内嵌浏览器/终端、电子表格预览。

---

## 2. 快速开始

```sh
# 环境：Node >= 24.9、corepack、Git Bash（Windows）
corepack enable
pnpm install            # 首次约 5 分钟

pnpm run build          # 完整构建（artifacts + check）
pnpm dsh web            # 从源码启动，默认 3080
```

本机 pnpm 走 corepack：`COREPACK_ENABLE_DOWNLOAD_PROMPT=0 pnpm <script>`。

---

## 3. 出包

### 3.1 Web 分发包

```sh
pnpm run build:artifacts    # 必须先构建，分发包打的是 lib/ 产物
pnpm run dist:web           # 默认输出到 ../alphadesk-web-dist
```

产物结构：

```
alphadesk-web-dist/
  packed/dsh/      229 个 @deepseek-ai/dsh-* tarball
  packed/vendor/   7 个 vendor tarball（Cordis 框架）
  install.ps1|sh   生成 app/package.json 并 npm install
  start.ps1|sh     用纯 Node 启动 dsh web
  scripts/         安装清单生成器
```

**闭包口径**：从 `@deepseek-ai/dsh-base` + `@deepseek-ai/dsh-web-app` + `@deepseek-ai/dsh` 出发，沿 `dependencies` / `peerDependencies` / `optionalDependencies` 求传递闭包。落到哪个 tarball 只取决于 `packages/*/*/package.json`。

**装包时不要加 `--omit=optional`**：`koffi` 的平台预编译二进制声明在 `@koromix/koffi-win32-x64` 的 optional 依赖里，跳过它会让 koffi 回退源码编译并要求 CMake，安装直接失败。

验证：

```sh
cd ../alphadesk-web-dist
node scripts/make-manifest.mjs packed app
cd app && npm install --no-audit --no-fund --registry https://registry.npmmirror.com
cd .. && DSH_HOME=$PWD/app/.dsh node app/node_modules/@deepseek-ai/dsh/lib/bin.js web --no-open
# 打印 URL + HTTP 401（一次性 token 认证）即为正常
```

### 3.2 Windows exe

```sh
export ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
export ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/
export DSH_FORK_SKIP_RUNTIME_SMOKE=1
export PATH="/c/WINDOWS/system32:$PATH"     # 让 tar 用 bsdtar，GNU tar 会把 C: 当远程主机

pnpm run package:desktop:win:x64:unsigned
```

产物：`apps/desktop/.desktop-build/targets/win-x64/unsigned-artifacts/`。

**这台机器上的已知限制**（非代码缺陷）：Electron 44.7.0 以 `ELECTRON_RUN_AS_NODE=1` 运行时无法写文件（`EPERM`），`prepare-dsh` 用构建宿主 Node 跑 pnpm 已绕过；打包后 `smoke-packaged-runtime` 仍会因宿主限制失败，但 exe 完整产出。

`compression: 'maximum'` + `electronLanguages: ['en','zh_CN']` 已在配置里；primary-runtime（Node+pnpm，111MB）通过 `extraResources` 的 `!primary-runtime/**/*` 排除，**不进安装包**。

### 3.3 桌面版与 Web 版的差异

| | Web 分发包 | 桌面 exe |
|---|---|---|
| 运行时 | 系统 Node | 内置 Electron |
| 体积 | 14MB（未装依赖） | ~50MB（未压缩 payload） |
| 附加能力 | 无 | 托盘、单实例、`dsh://` 协议、更新器、欢迎页、文件拖拽 |
| 适用 | 内部开发、服务器 | 业务人员双击使用 |

---

## 4. 跟随上游

### 4.1 取新版本

```sh
git fetch upstream --tags
git tag --sort=-creatordate | head -5      # 找最新 dsh-v*
```

上游是 prerelease 节奏（一周可跨 minor），`npm latest` 停在远古版本，**永远追 `dsh-v*` tag，不追 master 尖端**。

### 4.2 合并

```sh
git checkout fork/alphadesk
git merge dsh-v0.2.3-rc.1
```

冲突按 [FORK.md](FORK.md) 的账本逐条重放。仓库已启用 `rerere`，重复冲突会自动复用解法。

### 4.3 生成物一律重生成，不手工合并

| 生成物 | 命令 |
|---|---|
| `pnpm-lock.yaml` | `pnpm install` |
| `docs/module-graph*.md` | `pnpm run gen-module-graph` |
| `docs/config-catalog*.md` | `pnpm run gen-config-catalog` |
| `docs/tool-catalog*.md` | `pnpm run gen-tool-catalog` |
| `packages/extensions/cordis-client-runner/src/client/slot-catalog.ts` | `pnpm run gen-client-catalog` |
| `packages/preset/agent-preset/skills/cordis-composition-reference/references/packages.md` | `pnpm run gen-plugin-packages` |
| `packages/util/official-bundles/src/catalog.generated.ts` | `pnpm run gen-official-bundle-catalog` |
| `docs/cli-help*.md` | `pnpm run gen-cli-help` |
| `vendor/` | 按 `vendor/README.md` 的同步流程 |

### 4.4 最小检查集

```sh
pnpm install
pnpm run typecheck                                    # 5 个聚合程序
pnpm exec vitest run packages/bundle packages/client/ui-sidebar-documentpreview
pnpm run build:artifacts                              # 8 个门禁
pnpm exec tsx scripts/verify-product-use.ts
```

不要每次都跑全量套件；CI 负责穷尽覆盖。

### 4.5 合并后必读

- `docs/upgrade-guide/v<version>/` — 外部可见破坏
- [FORK.md](FORK.md) 的「已知残留」— 哪些是设计保留、不要改

---

## 5. 改功能

改动按**冲突风险从低到高**选：

| 层级 | 手段 | 适合 |
|---|---|---|
| 1. 组合层 | profile patch / `--patch` overlay | 单机/单部署的开关 |
| 2. bundle patch | `packages/bundle/*/cordis.patch.yml` | 产品默认组合 |
| 3. 源码 | `packages/*/src` | 上游没有的能力 |

### 5.1 开关一个功能（不改源码）

在 `$DSH_HOME/profiles/web/cordis.patch.yml` 里：

```yaml
# 关掉一行（base 或 bundle 里已有的 id）
- id: tool-web
  disabled: true

# 改一行的 config（整行替换，不是 merge）
- id: system-prompt
  config:
    personaPrefix: '你是券商投研助手。'

# 插入新行
- insert:
    - id: my-plugin
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        transport: stdio
        serverName: github
        command: npx
        args: ['-y', '@modelcontextprotocol/server-github']
```

改完用 `pnpm dsh --profile web --dump-config` 核对最终插件树。

### 5.2 改产品默认（改 bundle patch）

`packages/bundle/base/cordis.patch.yml`（共享核心）或 `packages/bundle/web-app/cordis.patch.yml`（浏览器面）。

**加行必须同步三处**，缺一会在不同阶段炸：

1. `cordis.patch.yml` 的 `insert` 里加行
2. `packages/bundle/*/package.json` 的 `dependencies` 里加包
3. 新包的话：`tsconfig.host.json` 或 `tsconfig.client.json` 加 `references`

### 5.3 加 MCP 服务器

`mcp-server` 行已在 `base/cordis.patch.yml` 里，默认 `disabled: true`。启用方式见 5.1。

多个服务器各占一行（不同 `id`、不同 `serverName`）。模型看到的工具名是 `mcp__<serverName>__<tool>`。

### 5.4 改界面

界面由 slot 组成，**不改上游源码**的做法是写一个客户端插件：

```
packages/client/ui-<name>/
  package.json       # dsh.client 声明 + exports ./client
  tsconfig.json
  tsdown.config.ts   # clientBundle(import.meta.dirname, ['lib/types/index.js'])
  src/client/index.ts   # apply(ctx) 里 ctx.slots.inject(...) 注册
  src/index.ts          # 空 node 半
  locale/{en,zh}.json
```

三处注册（缺一不可）：`tsconfig.client.json` references、web-app patch 的 `dsh.client` 行、web-app `package.json` 依赖。

常用 slot：

| slot | 用途 |
|---|---|
| `sidebar.brand.mark` / `.name` | 侧栏标志与产品名 |
| `sidebar.panellist` | 全局侧栏面板图标 |
| `conversation.session.header.actions` | 会话头按钮 |
| `conversation.input.left` / `.right` / `.dock` | 输入区左右与下方 |
| `conversation.chat.node` | 消息行（keyed by kind） |
| `tool.call.toolview` | 工具卡 |
| `settings.section` | 设置页分节 |
| `rightbar.session` / `sidebar.right.pane.tab` | 右侧栏 |

组件拿不到 `ctx`，所有数据走五份派生 share（`PropsRuntime` / `PropsRenderSlots` / `PropsStore` / `InjectFace` / `PropsLocale`）。

### 5.5 改品牌

| 位置 | 文件 |
|---|---|
| 侧栏/首屏标志与名称 | `packages/client/ui-brand-official/src/client/Brand.tsx` |
| 配色 | `packages/client/ui-brand-official/src/styles/alphadesk-theme.css` |
| 网页标题 | `apps/web/index.html`、`apps/web/vite.config.ts` |
| favicon / manifest | `apps/web/public/` |
| 桌面图标与安装器图 | `apps/desktop/scripts/gen-alphadesk-assets.mjs` |
| 产品名（桌面） | `apps/desktop/src/locale.ts`、`electron-builder-config.mjs` |

---

## 6. 门禁

改完按改动面选最小集：

| 改了什么 | 跑什么 |
|---|---|
| 任意组合层 | `verify-product-use`、`verify-cordis-config` |
| bundle/包的依赖 | `verify-package-dependencies`、`verify-client-packages` |
| 客户端插件 | `test:gui` |
| 加/删包 | `pnpm run build`（会跑全部 10 个门禁） |
| 文档 | `pnpm run doc-sync` |
| 删功能后 | `pnpm run gen-*` 重生成 catalog |

一次性全跑：`pnpm run check:all`。

---

## 7. 目录速查

```
apps/          cli（唯一应用入口）、web（前端构建）、desktop（Electron）、desktop-host
packages/
  bundle/      组合层：base / web-app / headless / sdk-app / acp-app / sdk-minimal
  core/        agent-loop、session、tools、system-prompt
  client/      浏览器插件（ui-* 各一个包）
  host/        HTTP 服务、静态资源、目录选择
  api/         Typert RPC 控制器
  llm/         模型适配器
  mcp/         MCP 客户端与资源
  skill/       技能发现与加载
scripts/       门禁、生成器、打包
vendor/        Cordis 框架源码（跟踪上游 SHA）
docs/          架构、子系统、手册
FORK.md        定制账本（改了什么）
MAINTAINING.md 本文件（怎么做）
```

---

## 8. 故障排查

| 现象 | 原因与处理 |
|---|---|
| `git push` 报 `syntax error near unexpected token` | 仓库路径含 `(2)`，lefthook pre-push 脚本解析失败。用 `git push --no-verify` |
| `pnpm install` 报 `ERR_PNPM_UNUSED_PATCH` | `pnpm-workspace.yaml` 的 `patchedDependencies` 与 `patches/` 不一致 |
| `verify-cordis-config` 报 `apps/cli/tests/profiles/acp/cordis.yml` | 仓库既有问题：该文件在 Windows 被检出为 CRLF 文本。不影响运行 |
| 打包卡在 `runtime:reset` | Electron Node 模式写不了文件（本机限制）。`prepare-dsh` 已改用宿主 Node |
| 分发包 `npm install` 报 CMake | 加了 `--omit=optional` 导致 koffi 丢预编译包。去掉该标志 |
| `dsh web` 返回 401 | 正常：URL 里的一次性 token 认证 |
| `patch: entry "xxx" not found` | patch 行引用了不在组合里的包。检查包名拼写与 bundle 依赖 |
