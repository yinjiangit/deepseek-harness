---
description: "AlphaDesk brand occupants and desk palette for the sidebar and conversation hero; for fork maintainers composing the AlphaDesk identity."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-brand-alphadesk

English | [中文](README.zh.md)

## Summary

This package gives the Web client its AlphaDesk identity: the desk mark and name in the sidebar, the mark in the blank-session conversation hero, and the securities-desk palette that retargets the brand color scale and brand typography. It registers on every build profile, so local builds, the Web profile, and packaged desktop builds all render the same identity. It has no runtime state and does not affect model requests.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount this plugin in the browser roster wherever the deployment's identity is AlphaDesk, in place of `dsh-client-ui-brand-official`.

### What the identity includes

The occupants cover `sidebar.brand.mark`, `sidebar.brand.name`, and `conversation.hero.brand.mark`; the palette sheet replaces the static brand-blue scale with the AlphaDesk navy scale, adds the `--dsh-brand-accent` gold, and points brand typography at the platform text stack. The browser title, favicon, and install manifest are build-time assets outside this plugin.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The three occupants install as one declaration-aware registration set: nested `ctx.slots.inject()` calls wait on each declaration, so the set works whether this row activates before or after a declarer, withdraws all occupants when any declaration collapses, and leaves no partial brand mix during HMR. The palette sheet mounts as a plugin-owned style tag appended after ui-theme's platform sheet, so equal-specificity `body` rules win by document order and retire with the plugin. The browser half is [`src/client/index.ts`](src/client/index.ts); the node half is an empty Loader seat.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

Read these pages when the brand surface is not enough. They move from the slots this package occupies to the shell that renders them.

- [ui-sidebar](../ui-sidebar/README.md) — declares `sidebar.brand.mark` and `sidebar.brand.name` and renders their fallbacks.
- [ui-conversation](../ui-conversation/README.md) — declares `conversation.hero.brand.mark` in the hero.
- [Web client architecture](../../../docs/subsystems/web-client.md) — how browser plugin rows load and register slots.

-----

<a id="model-experience"></a>
## Model Experience

None, as the package contributes browser presentation only; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>


These limits define how the AlphaDesk identity is supplied. They are current package constraints, not a task backlog.

- **One occupant set** — alternative presentation belongs in another Cordis package occupying the same slots.
- **The browser title is independent** — `DSH_CLIENT_TITLE` selects title text at build time rather than through a UI slot.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

Fork-local package: replay its roster line and palette on upstream sync (see the repository's FORK.md).

</details>
