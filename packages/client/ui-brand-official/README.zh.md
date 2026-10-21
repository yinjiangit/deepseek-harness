---
description: "面向侧栏与空白会话首屏的 AlphaDesk 品牌填充，仅在官方构建中生效；供选择或替换品牌呈现的用户与维护者阅读。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-brand-official

[English](README.md) | 中文

## 概述

本包让所有构建形态的客户端在侧栏显示 AlphaDesk 标志与名称、在空白会话首屏显示 AlphaDesk 标志，并装载 AlphaDesk 的深蓝配色表。包名与清单沿用上游 `ui-brand-official` 身份，使上游同步时花名册行继续可解析；不同的只是渲染的填充与配色。本包不保留运行时状态，也不影响模型请求。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

在 AlphaDesk 部署的浏览器插件名单中挂载本插件。它在所有构建 profile 中注册。

### 构建 profile

上游只在 `DSH_CLIENT_BUILD_PROFILE` 为 `official` 时注册这些填充，源码启动的构建因此保留外壳兜底——鱼形标志、本地构建标签与动画鱼首屏。AlphaDesk 把这些兜底视为品牌泄漏，所以本包取消了该门槛，在所有 profile 中注册；A 形标志、`AlphaDesk` 名称与深蓝配色因此也出现在 `dsh web` 开发运行中。

### 替换品牌

有自有品牌的部署可以改写本包的填充，也可以不装本包，另组一个包占据 `sidebar.brand.mark`、`sidebar.brand.name` 与 `conversation.hero.brand.mark`。占据槽位是唯一的组合方式；本包不提供品牌配置面。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

标志是一套 SVG 骨架——两条斜腿加一条越过右腿的横杠——取自 48×48 viewBox，主体随 `currentColor` 着色，横杠用 `--dsh-brand-accent`。三个填充作为一个「声明感知」注册集安装：嵌套的 `ctx.slots.inject()` 等待侧栏与首屏的声明，因此无论本行先于还是后于声明方激活都能生效；任一声明消失时整组撤回，HMR 期间不会留下半套品牌。配色表通过 `ctx.effect()` 挂在同一插件生命周期内，卸载即移除标签。浏览器半侧在 [`src/client/index.ts`](src/client/index.ts)；宿主半侧是一个空的 Loader 座位。浏览器标题属于构建环境（`DSH_CLIENT_TITLE`），不在槽位体系内。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

品牌面不够用时读这些页面。它们从本包占据的槽位走到渲染这些槽位的外壳。

- [ui-sidebar](../ui-sidebar/README.zh.md)——声明 `sidebar.brand.mark` 与 `sidebar.brand.name`，并提供兜底呈现。
- [ui-conversation](../ui-conversation/README.zh.md)——在首屏声明 `conversation.hero.brand.mark`。
- [ui-theme](../ui-theme/README.zh.md)——拥有设计平台，配色表改写的是它的静态品牌色阶。
- [Web 客户端架构](../../../docs/subsystems/web-client.zh.md)——浏览器插件行如何加载并注册槽位。

-----

<a id="model-experience"></a>
## 模型体验

无。本包只贡献浏览器呈现，没有任何内容进入模型请求。

#### KV Cache 影响

无。本包不组装也不发送 provider 请求。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>


这些限制界定品牌呈现的提供方式，是本包当前的约束，不是品牌方案比较，也不是待办清单。

- **始终注册**——填充与配色在所有构建 profile 中安装，与上游仅在 `official` profile 生效不同。
- **浏览器标题独立**——`DSH_CLIENT_TITLE` 在构建期选择标题文本，不走 UI 槽位。
- **包名沿用上游身份**——`@deepseek-ai/dsh-client-ui-brand-official` 保持不变，使上游花名册行与同步继续可解析；改名会分叉 bundle 行。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

AlphaDesk 配色就地改写上游的 `--dsw-static-deepseek-*` 名称，而不是引入新变量，因此所有读取该静态色阶的别名都自动跟随，无需重写别名。若在这里注册另一个变量名，需要在 `dsh-client-ui-theme` 里配套改别名。

</details>
