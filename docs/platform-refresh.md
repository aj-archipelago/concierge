# Platform refresh (unreleased)

This update brings assistant directories, shared assistants and teams, background-run recovery, file and media lifecycle improvements, applet sharing and storage controls, model/thinking settings, usage budgets, and local MCP access through Concierge Companion into the public application.

Upgrade with the matching Cortex version. Read the [Cortex upgrade guide](https://github.com/aj-archipelago/cortex/blob/main/docs/platform-refresh.md) for service order, storage grants, workspace checkpoints and provider configuration.

## Installation and migration

- Run `npm ci`, then `npm run prebuild`. Public defaults and locale assets are copied into the generated directories. Optional `app.config` overrides remain local to your installation.
- Preserve the Mongo database, Redis identity and namespace, existing shares, workspace identities and durable files. Started background agents are not automatically replayed after an uncertain interruption.
- Inspect indexes using `node scripts/ensure-background-indexes.mjs` and `node scripts/ensure-usage-indexes.mjs`. Add `--apply` after checking the intended database. These scripts retain compatible indexes.
- Configure exact storage origins with build-time `NEXT_PUBLIC_STORAGE_ORIGINS`, for example `https://examplefiles.blob.core.windows.net`. Set `CORTEX_STORAGE_CONTAINER_PREFIXES` on web and workers to match your file handler. See [storage grants](storage-grants.md).
- Set `CORTEX_DEFAULT_WEEKLY_COST_USD` consistently in Concierge and Cortex. The default is unlimited; an operator may configure a nonnegative allowance. Existing per-key policies, spend and reset anchors remain intact.
- Custom-domain Azure Easy Auth installations must set build-time `NEXT_PUBLIC_AUTH_USE_EASY_AUTH=true`. Other production hosts retain their configured authentication flow.

Publishing an applet version does not grant link access by itself. Choose recipients or enable link sharing explicitly. Existing shares are preserved. Assistant messages use the canonical `assistant` sender; legacy conversation history remains readable.

## Optional services

Concierge Companion is available from Settings → Capabilities → Connectors when its relay, owner namespace, and admin key are configured. Installer links come from `COMPANION_DOWNLOAD_MAC` and `COMPANION_DOWNLOAD_WINDOWS`. Use your own hosted, signed installers for distribution. See the [Companion guide](https://github.com/aj-archipelago/cortex/blob/main/docs/local-companion.md).

The `sourceQa` applet SDK API is an optional operator integration. This repository does not ship a retrieval corpus or a source-specific search service. The routes return 503 until `CORTEX_SOURCE_QA_ENABLED=true` is configured. Enable it only with a Cortex service implementing `source_qa` and `source_qa_initial_questions`; their GraphQL contracts are in `src/graphql.js`. Existing SDK access checks and rate limits still apply. The query route accepts progress through `requestProgress`, including final answer metadata and citations. Starter question payloads retain the configured service's cache keys.

Media provider availability, transcription options, gateway endpoints, cost estimates and notification destinations all depend on operator configuration. No hosted services or organization accounts are provisioned by this update.

## Validation

Run `npm run precommit` for lint, formatting and the complete unit suite, then `npm run build`. For browser checks, use an isolated database and Cortex instance. Check populated desktop/mobile, light/dark, and English/Arabic views, including chat, assistant directories, connectors, media and applet sharing. Validate worker replacement and signed storage requests in staging before rollout.
