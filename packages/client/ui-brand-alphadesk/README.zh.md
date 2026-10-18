---
description: "面向侧栏与会话首屏的 AlphaDesk 品牌填充与工作台配色；供组合 AlphaDesk 身份的 fork 维护者阅读。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-brand-alphadesk

[English](README.md) | 中文

## 概述

本包为 Web 客户端提供 AlphaDesk 身份：侧栏的工作台标志与名称、会话首屏的标志，以及把品牌色阶与品牌字体重定向为券商风格的配色表。它在所有构建 profile 下都会注册，本地构建、Web profile 与打包桌面构建因此呈现同一身份。本包不保留运行时状态，也不影响模型请求。

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

在部署身份为 AlphaDesk 的浏览器插件名单中挂载本插件，替换 `dsh-client-ui-brand-official`。

### 身份包含的内容

品牌填充覆盖 `sidebar.brand.mark`、`sidebar.brand.name` 与 `conversation.hero.brand.mark`；配色表把静态品牌蓝色阶替换为 AlphaDesk 深蓝色阶，新增 `--dsh-brand-accent` 金色，并让品牌字体指向平台文本字体栈。浏览器标题、favicon 与安装清单是构建期资产，不在本插件范围内。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现内部——点击展开</summary>

三个品牌填充作为一个声明感知的注册集安装：嵌套的 `ctx.slots.inject()` 逐个等待声明，因此无论本行早于还是晚于声明方激活都能成立，任一声明坍缩时一并撤下全部填充，HMR 期间不会出现半套品牌。配色表以插件自有 style 标签挂载，位置在 ui-theme 平台样式表之后，同特异性的 `body` 规则按文档顺序取胜，并随插件退役。浏览器半边是 [`src/client/index.ts`](src/client/index.ts)；Node 半边是一个空的 Loader 席位。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

品牌面不够用时阅读以下页面。它们从本包占据的品牌位走向渲染品牌位的外壳。

- [ui-sidebar](../ui-sidebar/README.zh.md) — 声明 `sidebar.brand.mark` 与 `sidebar.brand.name` 并渲染回退。
- [ui-conversation](../ui-conversation/README.zh.md) — 在会话首屏声明 `conversation.hero.brand.mark`。
- [Web 客户端架构](../../../docs/subsystems/web-client.zh.md) — 浏览器插件行如何加载并注册 slot。

-----

<a id="model-experience"></a>
## 模型体验

无，因为本包只贡献浏览器呈现；这里没有任何内容进入模型请求。

#### KV Cache 影响

无；本包既不组装也不发送提供方请求。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>


这些限制界定了 AlphaDesk 身份的供给方式。它们是当前包约束，不是任务积压。

- **只有一组填充**——替代呈现属于占据相同 slot 的另一个 Cordis 包。
- **浏览器标题独立**——`DSH_CLIENT_TITLE` 在构建时选择标题文本，而非通过 UI slot。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

Fork 本地包：上游同步时重放其花名册行与配色表（见仓库根的 FORK.md）。

</details>
