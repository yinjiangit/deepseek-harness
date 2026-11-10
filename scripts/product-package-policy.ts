/** Non-default package roles retained outside the experimental group. */

/** Product role that does not require a default runtime mount. */
export type ProductPackageCategory = 'optional' | 'sdk' | 'build' | 'test' | 'web-distribution' | 'declarations'

/** One explicitly maintained package role and its reason. */
export interface ProductPackagePolicy {
  /** Why this package remains outside the experimental group. */
  readonly reason: string
  /** The supported product role checked against its directory. */
  readonly category: ProductPackageCategory
}

/**
 * Exceptions to default runtime reachability, keyed by repository-relative package directory.
 * Optional integrations may be reached by an optional bundle without becoming default capabilities.
 */
export const PRODUCT_PACKAGE_POLICY: Readonly<Record<string, ProductPackagePolicy>> = {
  'packages/client/ui-goal': { category: 'optional', reason: 'GoalBar surface; AlphaDesk ships no goal feature.' },
  'packages/client/ui-message-feedback': { category: 'optional', reason: 'Per-message feedback surface; AlphaDesk removed the feedback feature.' },
  'packages/client/ui-open-in-app': { category: 'optional', reason: 'Open In split button; AlphaDesk removed the open-in-app feature.' },
  'packages/client/ui-plan': { category: 'optional', reason: 'Plan-mode composer seat; AlphaDesk ships no plan mode.' },
  'packages/client/ui-plugin-market': { category: 'optional', reason: 'Discover tab for plugin indexes; AlphaDesk ships no plugin market.' },
  'packages/client/ui-schedule': { category: 'optional', reason: 'Schedule task page; AlphaDesk removed the schedule feature.' },
  'packages/client/ui-settings-account': { category: 'optional', reason: 'DeepSeek account settings; AlphaDesk ships API-key onboarding only.' },
  'packages/client/ui-settings-session-log': { category: 'optional', reason: 'Session-log upload switch; its Host provider left the composition.' },
  'packages/client/ui-sidebar-browser': { category: 'optional', reason: 'Embedded browser sidebar; AlphaDesk removed it.' },
  'packages/client/ui-sidebar-terminal': { category: 'optional', reason: 'Terminal sidebar; AlphaDesk removed it.' },
  'packages/core/tool-executor-ptc': { category: 'optional', reason: 'PTC executor row stays disabled in every shipped profile; run_code is not offered.' },
  'packages/credentials/deepseek-account-platform': { category: 'optional', reason: 'DeepSeek browser PKCE login; AlphaDesk ships API-key onboarding only.' },
  'packages/document/office-to-pdf': { category: 'optional', reason: 'Host Office conversion; AlphaDesk renders Office tabs as unavailable.' },
  'packages/extensions/cordis-client-runner': { category: 'optional', reason: 'Cordis runtime self-modification; AlphaDesk removed creator mode.' },
  'packages/extensions/tool-cordis': { category: 'optional', reason: 'Cordis inspection tools; AlphaDesk removed creator mode.' },
  'packages/extensions/ui-cordis': { category: 'optional', reason: 'Cordis plugin definition card; AlphaDesk removed creator mode.' },
  'packages/goal/command-goal': { category: 'optional', reason: '/goal command; AlphaDesk ships no goal feature.' },
  'packages/goal/goal-round-driver': { category: 'optional', reason: 'Goal round driver; AlphaDesk ships no goal feature.' },
  'packages/goal/tool-goal': { category: 'optional', reason: 'Goal tools; AlphaDesk ships no goal feature.' },
  'packages/host/open-in-app': { category: 'optional', reason: 'Open In host routes; AlphaDesk removed the open-in-app feature.' },
  'packages/host/product-telemetry-otel': { category: 'optional', reason: 'Desktop product telemetry; AlphaDesk removed telemetry.' },
  'packages/llm/llm-deepseek-account': { category: 'optional', reason: 'DeepSeek account provider auth; AlphaDesk ships API-key auth only.' },
  'packages/llm/llm-pi-ai': { category: 'optional', reason: 'Design-verification twin of the DeepSeek adapter; never mounted by a shipped profile.' },
  'packages/llm/plugin-package-inventory-deepseek': { category: 'optional', reason: 'Plugin package inventory sent with official API requests; AlphaDesk removed it.' },
  'packages/plan/plan-mode': { category: 'optional', reason: 'Plan mode; AlphaDesk ships no plan mode.' },
  'packages/session/session-log-deepseek': { category: 'optional', reason: 'Session-log upload to the official API; AlphaDesk removed it.' },
  'packages/session/session-telemetry': { category: 'optional', reason: 'Session telemetry seam; AlphaDesk removed telemetry.' },
  'packages/session/session-telemetry-otel': { category: 'optional', reason: 'OTel session-log upload; AlphaDesk removed telemetry.' },
  'packages/skill/skill-office': { category: 'optional', reason: 'Bundled Office skills; AlphaDesk removed the Office toolchain.' },
  'packages/skill/tool-workspace-dependencies': { category: 'optional', reason: 'Bundled Python/Node payload locator; AlphaDesk ships no Python payload.' },
  'packages/telemetry/otel': { category: 'optional', reason: 'OTel channels; AlphaDesk removed telemetry.' },
  'packages/util/plugin-market-index': { category: 'optional', reason: 'Plugin market index format; AlphaDesk ships no plugin market.' },
  'packages/core/agent-tool-presentation': { category: 'optional', reason: 'Deprecated selector retained for existing executor configurations.' },
  'packages/browser-use/browser-use': { category: 'optional', reason: 'Service definition used by explicitly selected browser providers.' },
  'packages/computer-use/computer-use': { category: 'optional', reason: 'Service definition used by explicitly selected computer providers.' },
  'packages/lsp/lsp': { category: 'optional', reason: 'Service definition for deployment-configured language servers.' },
  'packages/lsp/lsp-stdio': { category: 'optional', reason: 'Requires an explicit server list and language-server executables.' },
  'packages/lsp/tool-lsp': { category: 'optional', reason: 'Model tools selected together with a configured LSP provider.' },
  'packages/ssh/ssh': { category: 'optional', reason: 'Explicit remote connection and helper configuration.' },
  'packages/ssh/ssh-helper-runtime': { category: 'optional', reason: 'Private executable carrier for explicitly configured SSH connections.' },
  'packages/ssh/fs-ssh': { category: 'optional', reason: 'Remote filesystem provider selected in an SSH composition.' },
  'packages/ssh/sandbox-ssh': { category: 'optional', reason: 'Remote confinement provider selected in an SSH composition.' },
  'packages/ssh/subprocess-ssh': { category: 'optional', reason: 'Remote process provider selected in an SSH composition.' },
  'packages/storage/storage-sqlite': { category: 'optional', reason: 'Persistent storage requires an explicit database path and backend selection.' },
  'packages/subagent/subagent-acp': { category: 'optional', reason: 'Requires a configured external ACP agent command.' },
  'packages/subagent/subagent-claude-code': { category: 'optional', reason: 'Separately installed native Claude Code agent integration.' },
  'packages/subagent/subagent-codex': { category: 'optional', reason: 'Separately installed native Codex agent integration.' },
  'packages/subagent/subagent-dsh-sdk': { category: 'optional', reason: 'Requires an explicitly configured external DSH home.' },
  'packages/web/web-search-exa': { category: 'optional', reason: 'Alternative search provider requiring its own API credentials.' },
  'packages/web/web-search-perplexity': { category: 'optional', reason: 'Alternative search provider requiring its own API credentials.' },
  'packages/context/tmux-context': { category: 'optional', reason: 'Context contribution requiring a tmux pane.' },
  'packages/fs/tool-str-replace-editor': { category: 'optional', reason: 'Explicit alternative to the default filesystem editing tools.' },
  'packages/fs/fs-observation-policy': { category: 'optional', reason: 'Read-before-mutation guard that a deployment enables on the disabled dsh-base row.' },
  'packages/sdk/client': { category: 'sdk', reason: 'Published TypeScript embedding client runs in the consumer process.' },
  'packages/typert/generator': { category: 'build', reason: 'Build-time generation of type metadata.' },
  'packages/test-support/agent-loop-testkit': { category: 'test', reason: 'Published agent-loop test harness.' },
  'packages/test-support/tool-testkit': { category: 'test', reason: 'Shared tool definition and execution fixtures for tests and benchmarks.' },
  'packages/test-support/client-runtime': { category: 'test', reason: 'Published browser plugin test harness.' },
  'packages/test-support/llm-mock-server': { category: 'test', reason: 'Published model-provider test server.' },
  'packages/test-support/llm-replay': { category: 'test', reason: 'Published recorded-model replay harness.' },
  'packages/test-support/loader-smoke': { category: 'test', reason: 'Published plugin Loader smoke-test harness.' },
  'packages/test-support/remote-mock': { category: 'test', reason: 'Published typed Remote test proxies.' },
  'packages/test-support/session-snapshot': { category: 'test', reason: 'Published Session snapshot replay harness.' },
  'packages/client/web': { category: 'web-distribution', reason: 'Browser boot kernel bundled into the Web distribution.' },
  'packages/client/ui-dockkit': { category: 'web-distribution', reason: 'Layout library bundled into the Web distribution.' },
  'packages/util/package-manifest': { category: 'declarations', reason: 'Shared package metadata declarations have no runtime mount.' },
}
