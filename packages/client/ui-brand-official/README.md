---
description: "AlphaDesk brand occupants for the sidebar and the blank-session hero, active only in official builds; for users and maintainers choosing or replacing brand presentation."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-brand-official

English | [中文](README.zh.md)

## Summary

This package gives every client build the AlphaDesk mark and name in the sidebar and the blank-session hero, together with the AlphaDesk navy palette sheet. The package name and manifest keep the upstream `ui-brand-official` identity so upstream syncs keep resolving the roster row; only the rendered occupants and the palette differ. It has no runtime state and does not affect model requests.

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

Mount this plugin in the browser roster of the AlphaDesk deployment. It registers in every build profile.

### Build profiles

Upstream registers these occupants only when `DSH_CLIENT_BUILD_PROFILE` is `official`, leaving source-launched builds on the shell fallbacks — the fish mark, the local-build label and the animated hero fish. AlphaDesk treats every fallback as brand leakage, so this package drops the gate and registers in all profiles; the alpha mark, the `AlphaDesk` name and the navy palette therefore also appear in `dsh web` development runs.

### Replacing the brand

A deployment with another identity either edits the occupants here or leaves this package out and composes another package that occupies `sidebar.brand.mark`, `sidebar.brand.name` and `conversation.hero.brand.mark`. Occupying a slot is the only composition route; there is no brand configuration surface here.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The mark is one SVG skeleton — two mitered legs plus a crossbar past the right leg — drawn from a 48×48 viewBox and colored by `currentColor` with the crossbar on `--dsh-brand-accent`. The three occupants install as one declaration-aware registration set: nested `ctx.slots.inject()` calls wait on the sidebar and hero declarations, so the set works whether this row activates before or after the declarers, withdraws every occupant when any declaration collapses, and leaves no partial brand mix during HMR. The palette sheet mounts in the same plugin lifetime through `ctx.effect()`, so teardown removes the tag. The browser half is [`src/client/index.ts`](src/client/index.ts); the node half is an empty Loader seat. The browser title is a build-environment concern (`DSH_CLIENT_TITLE`), outside the slot system.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

Read these pages when the brand surface is not enough. They move from the slots this package occupies to the shell that renders them.

- [ui-sidebar](../ui-sidebar/README.md) — declares `sidebar.brand.mark` and `sidebar.brand.name` and renders their fallbacks.
- [ui-conversation](../ui-conversation/README.md) — declares `conversation.hero.brand.mark` in the hero.
- [ui-theme](../ui-theme/README.md) — owns the design platform whose static brand scale the palette sheet retargets.
- [Web client architecture](../../../docs/subsystems/web-client.md) — how browser plugin rows load and register slots.

-----

<a id="model-experience"></a>
## Model Experience

None, as the package contributes browser presentation only; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>


These limits define how brand presentation is supplied. They are current package constraints, not a brand-design comparison or a task backlog.

- **Always registers** — the occupants and the palette install in every build profile, unlike upstream, which gates them on the `official` profile.
- **The browser title is independent** — `DSH_CLIENT_TITLE` selects title text at build time rather than through a UI slot.
- **The package name keeps the upstream identity** — `@deepseek-ai/dsh-client-ui-brand-official` stays as-is so upstream roster rows and syncs keep resolving; renaming it would fork the bundle rows.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The AlphaDesk palette retargets upstream `--dsw-static-deepseek-*` names in place rather than introducing new variables, so every alias that reads the static scale follows without an alias rewrite. Registering another variable name here would need matching alias edits in `dsh-client-ui-theme`.

</details>
