# V2 Applet Migration Plan

## Goal

Make v2 canvas applets the only editable applet experience while preserving legacy applet behavior forever.

The product rule is simple:

- Legacy applets keep working through their old published links, app-store slugs, prompt endpoints, data endpoints, and file endpoints.
- If a legacy applet is opened or edited through Concierge, it is migrated to v2 first, then opens as a v2 canvas applet.
- After migration, the applet stays v2. There is no v1 edit path.
- Workspaces stop showing an applet editor tab. Workspaces may still own prompts/files that migrated applets can use through compatibility routes.

## Current State

There are two applet systems today.

### Legacy v1 Workspace Applets

- `Workspace.applet` points to an `Applet`.
- `Applet.html` and `Applet.htmlVersions[].content` store inline HTML.
- `/api/workspaces/:id/applet` creates, reads, and updates the workspace applet.
- `/api/workspaces/:id/applet/chat` drives the old workspace applet editor.
- `/api/workspaces/:id/applet/execute_prompt` runs workspace prompts for applet HTML.
- `/published/workspaces/:id/applet` serves old published applets.
- App-store rows may point at `App.workspaceId` instead of `App.appletId`.
- Workspace prompts are `Workspace.prompts[]` references to `Prompt` documents with `title`, `text`, `llm`, `agentMode`, `reasoningEffort`, and attached `files`.

### V2 Canvas Applets

- `Applet.version === 2`.
- Draft HTML is a workspace HTML file referenced by `Applet.filePath`.
- Saved versions are immutable `Applet.htmlVersions[]` snapshots, usually externalized through `contentUrl`, `contentBlobPath`, hash, size, and context fields.
- Published content is a canonical published snapshot on the applet record, separate from Draft.
- `/api/canvas-applets` and `/api/canvas-applets/:id` are the registry/editing APIs.
- `/published/applets/:id` is the public v2 applet endpoint.
- App-store rows can point directly at `App.appletId`.
- Runtime SDK APIs are applet-ID based:
    - `ConciergeSDK.data` -> `/api/canvas-applets/:id/data`
    - `ConciergeSDK.sharedData` -> `/api/canvas-applets/:id/shared-data/:key`
    - `ConciergeSDK.files` -> `/api/canvas-applets/:id/files`
    - `ConciergeSDK.models.generate` -> `/api/applet/model-generate`
    - `ConciergeSDK.agent.chat` -> `/api/applet/agent-chat`

## Target Contract

### One Editable Applet Surface

The Applets/canvas interface is the only applet editing surface.

- The Applets page lists native v2 applets and legacy workspace applets.
- Legacy applets are shown as applets, not as workspace tabs.
- Clicking a legacy applet calls migration and then opens the v2 canvas applet.
- Editing a legacy applet from any entry point calls migration and then edits the v2 Draft.
- Workspace applet editor UI is removed or hidden.

### Legacy Compatibility Forever

Legacy routes become compatibility adapters, not editing surfaces.

- Old published links remain valid.
- Old app-store slugs remain valid.
- Old applet HTML that calls workspace prompt/data/file endpoints keeps working.
- Old workspace prompt IDs keep running.
- The adapters resolve the migrated v2 applet when one exists.
- If a legacy record has not migrated yet, adapters can run in legacy mode for runtime-only calls, or migrate first when the request is an open/edit request.

### Stable Identity

- Migration keeps the existing `Applet._id`.
- `Workspace.applet` continues to point to that same applet ID.
- Migrated applet HTML contains:
    - `<meta name="concierge-type" content="applet">`
    - `<meta name="applet-id" content="...">`
    - `<meta name="applet-name" content="...">`
- `Applet.html` is cleared after migration.
- `Applet.version` is set to `2`.

### Prompt Compatibility

Workspace prompts remain usable by migrated applets.

The new canonical bridge is applet-ID based:

- `GET /api/canvas-applets/:id/workspace-prompts`
- `POST /api/canvas-applets/:id/workspace-prompts/:promptId/run`

The bridge resolves the workspace server-side from `Workspace.applet` or `Applet.migratedFromWorkspaceId`.

The legacy endpoint remains:

- `POST /api/workspaces/:id/applet/execute_prompt`

It should delegate to the same shared execution helper as the v2 prompt bridge.

## Data Model Additions

### `Applet`

Add:

- `migratedFromWorkspaceId`: optional `ObjectId` ref `Workspace`
- `migratedFromAppletVersion`: optional number, initially `1`
- `migratedAt`: optional date
- `migrationStatus`: optional enum: `null | "pending" | "migrated" | "failed"`
- `migrationError`: optional string
- `migrationWarnings`: optional string array

Keep:

- `version`
- `filePath`
- `htmlVersions`
- published content fields
- SDK suspension fields

Add an index on `{ migratedFromWorkspaceId: 1 }` if production lookup needs it.

### `Workspace`

Keep `Workspace.applet` as the legacy linkage and prompt-bridge lookup.

Do not add a new workspace applet editor state. Workspaces are source records for prompts/files and legacy links, not applet editing surfaces.

### `App`

Backfill active app-store rows that point at workspace applets:

- keep `workspaceId`
- set `appletId`
- preserve `slug`, `name`, `description`, `icon`, `status`, and `author`

After backfill, app-store routing should prefer `appletId`. `workspaceId` can remain as an edit/backlink hint.

## Lazy Migration Triggers

Migrate on first applet open or edit.

Triggers:

- Opening a legacy applet from the Applets page.
- Opening an app-store applet whose `App` row has only `workspaceId`.
- Opening an old published workspace applet link if the user is in an authenticated editable context.
- Calling an edit/manage/publish action on a legacy applet.
- Running an explicit migration script.

Non-triggers:

- Listing workspaces.
- Viewing a workspace prompt collection.
- Runtime-only legacy prompt execution from old applet HTML.
- Runtime-only legacy data/file calls that can be safely handled through adapters.

Published public traffic can either migrate on read or serve legacy content through the adapter. Prefer migration on authenticated owner/admin open, and keep unauthenticated public reads conservative unless we have verified the migration helper is safe without owner context.

## Migration API

Add one idempotent endpoint for UI entry points:

- `POST /api/canvas-applets/migrate`

Request body accepts one of:

- `{ workspaceId }`
- `{ appletId }`
- `{ appSlug }`

Response:

```json
{
    "appletId": "...",
    "version": 2,
    "alreadyMigrated": false,
    "workspaceId": "...",
    "workspacePath": "/workspace/files/applets/name.html",
    "filePath": "https://...",
    "publishedVersionIndex": 0,
    "app": { "slug": "..." },
    "warnings": []
}
```

The endpoint delegates to the shared server helper:

```js
async function migrateWorkspaceAppletToV2({
    workspaceId,
    appletId,
    user,
    dryRun = false,
})
```

The helper must be safe to call repeatedly.

## Migration Algorithm

### Step 1: Resolve Source

Resolve the source from `workspaceId`, `appletId`, or `appSlug`.

Then:

1. Load the workspace and applet.
2. Verify the current user owns/administers the applet when the operation is an edit/open from Concierge.
3. If the applet is already v2 with `filePath`, return it unchanged.
4. Acquire a per-applet migration lock by setting `migrationStatus: "pending"` only when the current status is absent, failed, or stale.
5. If another fresh migration is pending, return `409` from request paths and let batch scripts wait/retry.

### Step 2: Pick Source HTML

Pick source HTML in this order:

1. `Applet.html` if non-empty.
2. Published version content if `publishedVersionIndex` is set.
3. Latest `htmlVersions` content.
4. Externalized version blob content when a version has `contentBlobPath` and `contentContextId`.

If no HTML exists, create an empty applet Draft and record a warning.

### Step 3: Normalize HTML

Inject or replace:

- applet type meta tag
- applet ID meta tag using the existing applet ID
- applet name meta tag
- SDK script if missing
- optional legacy workspace metadata bootstrap:
    - `window.CONCIERGE_LEGACY_WORKSPACE_ID`
    - `window.CONCIERGE_WORKSPACE_PROMPT_ENDPOINT`

Do not rewrite applet business logic during database migration. The migration preserves behavior; future applet edits can modernize code.

### Step 4: Write V2 Draft

Upload normalized HTML to applet global storage.

Create or reuse a `File` record so v2 registry payloads can resolve:

- `filePath`
- `fileHash`
- `fileBlobPath`
- `workspacePath`

The current `ensureAppletWorkspaceFile()` helper is the closest starting point, but migration must also set `version: 2` and persist migration metadata.

### Step 5: Convert Saved Versions

For each legacy version:

1. Resolve inline or externalized HTML.
2. Normalize with v2 applet metadata.
3. Store as a v2 snapshot with `createAppletVersionEntry(..., { external: true })`.
4. Preserve original timestamps when possible.

If no legacy version exists but source HTML exists, create one saved version from source HTML.

### Step 6: Convert Published State

If the v1 applet had `publishedVersionIndex`:

1. Preserve that version number when valid.
2. Create canonical published content using `applyPublishedAppletSnapshot()`.
3. Set published content blob/hash/size/context/version/timestamp fields.

If the old published index is invalid, publish the latest migrated version and record a warning.

### Step 7: Backfill App-Store Row

Find active app-store rows linked by workspace:

- `{ workspaceId, type: "applet" }`

Set:

- `appletId`
- unchanged `workspaceId`
- unchanged slug/status/metadata

If a duplicate `App` row already exists for the same slug, keep one active row only after confirming both rows point to the same applet.

### Step 8: Mark Complete

Persist:

- `version: 2`
- `html: ""`
- `filePath`
- migrated `htmlVersions`
- published content fields
- `migratedFromWorkspaceId`
- `migratedFromAppletVersion: 1`
- `migratedAt`
- `migrationStatus: "migrated"`
- clear `migrationError`
- save `migrationWarnings`

Leave `Workspace.applet` pointing at the same applet ID.

## UI Changes

### Workspaces

Remove the workspace applet editor surface.

- Hide/remove the Applet tab from workspace tabs.
- Remove calls from workspace UI to `/api/workspaces/:id/applet` for editing.
- If a workspace has a legacy applet, show only an "Open applet" action where useful.
- That action calls `POST /api/canvas-applets/migrate`, then opens the v2 canvas applet.

Workspace prompts/files remain editable in the workspace as prompt collection features.

### Applets Page

The Applets page becomes the migration entry point.

It should list:

- v2 applets from `/api/canvas-applets`
- legacy workspace applets from a new inventory endpoint or an expanded registry response

For legacy rows, show normal applet cards with enough status metadata for support/debugging:

- applet name
- linked workspace name
- published/app-store state
- migration status

Click behavior:

1. If v2, open normally.
2. If legacy, call migration.
3. Replace the card with the returned v2 applet.
4. Open the v2 canvas applet.

### Canvas Applet Editor

All editing after migration uses v2 Draft/version/publish operations.

Do not preserve old workspace chat editing as a parallel editor. If the user asks to edit a legacy applet, migrate first, then edit the v2 Draft.

### Apps and Sidebar

Update app listing and app slug resolution:

- Prefer `App.appletId`.
- If an app-store row has only `workspaceId`, call migration before opening in an editable context.
- Public `/apps/:slug` keeps working for old slugs.
- Edit buttons should open the v2 applet editor after migration, not `/workspaces/:id` applet tab.

## Route Compatibility

### Legacy Workspace Applet Route

`/api/workspaces/:id/applet` should no longer be an editor backend.

Recommended behavior:

- GET from old clients: migrate if authenticated owner/admin, then return a compatibility payload pointing at the v2 applet.
- PUT from old clients: migrate first, then either:
    - translate simple publish/name operations to v2, or
    - return `410 Gone` with the v2 applet ID and open/edit URL.

Avoid maintaining full old `htmlVersions` write semantics here. That would recreate the v1 editor.

### Legacy Workspace Applet Chat Route

`/api/workspaces/:id/applet/chat` should stop driving edits.

Recommended behavior:

- return `410 Gone`
- include the migrated v2 applet ID if available
- tell clients to use the v2 canvas applet editor

If there is a short rollout window where old clients still call it, migrate first and return a structured "use v2 editor" response rather than generating new v1 HTML.

### Legacy Published Route

`/published/workspaces/:id/applet` and `/api/published/workspaces/:id/applet` remain forever.

Behavior:

- Resolve workspace.
- Resolve `Workspace.applet`.
- If migrated, serve/proxy/redirect to v2 published applet content.
- If not migrated and public unauthenticated migration is not enabled, serve legacy published content.
- If owner/admin opens it from Concierge, migrate first, then serve v2 content.

Permanent redirects are acceptable only after verifying old shared links and embeds tolerate the URL change. A proxy is safer.

### Legacy Prompt Execution Route

`/api/workspaces/:id/applet/execute_prompt` remains forever as a runtime adapter.

It should call the same shared helper as the new v2 prompt bridge. This protects old applet HTML that has hardcoded the workspace endpoint.

## Workspace Prompt Bridge

Add applet-ID routes:

- `GET /api/canvas-applets/:id/workspace-prompts`
- `POST /api/canvas-applets/:id/workspace-prompts/:promptId/run`

The routes:

1. Validate applet access with existing applet access rules.
2. Resolve the linked workspace by `Workspace.applet` or `Applet.migratedFromWorkspaceId`.
3. Confirm the requested prompt belongs to that workspace.
4. Use one shared execution helper for both legacy and v2 routes.
5. Preserve current behavior:
    - workspace `systemPrompt`
    - prompt text/model/pathway
    - `agentMode`
    - `reasoningEffort`
    - prompt-attached files
    - request files
    - workspace/app/user file access context
    - `{ output, citations }` response shape

Add SDK helpers:

```js
ConciergeSDK.workspace.prompts.list();
ConciergeSDK.workspace.prompts.run({ promptId, input, files, chatHistory });
```

For applets with no linked workspace, return an explicit "no workspace prompts are available for this applet" error.

## Script Plan

Add `scripts/migrate-v2-applets.mjs`.

Modes:

- `--dry-run`: inventory and planned actions only.
- `--workspace <id>`: migrate one workspace applet.
- `--applet <id>`: migrate one legacy applet.
- `--all`: migrate all legacy workspace applets.
- `--limit <n>`: batch limit.
- `--resume`: skip migrated applets and retry failed/stale pending applets.

Dry-run output should include:

- workspace ID/name
- applet ID/name/version
- source HTML selection
- version count
- published state
- app-store row state
- prompt count
- file/data/shared-data presence
- expected migration warnings
- blockers

Use structured JSON logs so a failed batch can be resumed.

## Tests

### Unit Tests

Add focused tests for:

- legacy source resolution from workspace ID, applet ID, and app slug
- source HTML selection order
- v1 inline HTML -> v2 Draft file
- v1 inline versions -> external v2 snapshots
- published index preserved
- invalid published index falls back to latest with a warning
- app-store row gains `appletId`
- migration is idempotent
- failed upload leaves the applet unmigrated or marked failed without partial publication
- workspace prompt bridge and legacy execute route use the same variables/helper

### API Tests

Add route tests for:

- `POST /api/canvas-applets/migrate` migrates by workspace ID.
- `POST /api/canvas-applets/migrate` returns existing v2 applet on rerun.
- Applets inventory includes legacy workspace applets.
- Clicking/opening a legacy applet path returns a v2 applet ID.
- `GET /api/workspaces/:id/applet` no longer returns an editable v1 surface after migration.
- `POST /api/workspaces/:id/applet/execute_prompt` still works before and after migration.
- `GET /api/published/workspaces/:id/applet` still serves old links.
- `GET /api/canvas-applets/:id/workspace-prompts` lists linked workspace prompts.
- `POST /api/canvas-applets/:id/workspace-prompts/:promptId/run` runs agentic and non-agentic prompts.

### UI Tests

Cover:

- workspace applet tab is absent.
- Applets page lists legacy applets.
- opening a legacy applet migrates and opens the v2 canvas applet.
- editing a migrated applet writes v2 Draft/version state.
- app-store/sidebar old applet entries open migrated v2 applets.
- old published workspace links still load.

### Regression Tests To Keep

Keep and extend:

- `canvasAppletV1Materialize`
- `workspaceAppletExecutePrompt.legacy-files`
- `canvasAppletRoute`
- `canvasAppletVersioning`
- `canvasAppletData`
- `canvasAppletSharedData`
- applet SDK docs/util tests

## Rollout Phases

### Phase 0: Inventory

Run dry-run inventory:

- count v1 workspace applets
- count published v1 applets
- count app-store rows with only `workspaceId`
- count applets with inline versions only
- count applets with missing HTML
- count prompt collections and attached files
- count likely hardcoded legacy endpoint usage if detectable from HTML

No mutation in this phase.

### Phase 1: Permanent Runtime Adapters

Ship compatibility before migration:

- legacy published route adapter
- legacy prompt execution adapter
- app-store slug adapter
- applet access rules that understand migrated and unmigrated legacy records

At the end of this phase, old runtime behavior is protected even before records migrate.

### Phase 2: Lazy Migration Entry Points

Ship:

- migration helper
- `POST /api/canvas-applets/migrate`
- Applets page legacy inventory
- Applets page open -> migrate -> open v2 flow
- app-store/sidebar open -> migrate -> open v2 flow

At the end of this phase, active applets move to v2 when users touch them.

### Phase 3: Remove Workspace Applet Editing

Ship:

- no Applet tab in workspaces
- no v1 workspace applet editor UI
- `/api/workspaces/:id/applet/chat` no longer edits
- edit buttons route to Applets/canvas after migration

At the end of this phase, there is no user-visible v1 applet editing surface.

### Phase 4: Batch Migration

Run the script in batches for applets that have not been opened:

1. dry run
2. migrate small batch
3. verify
4. increase batch size
5. finish remaining records

Pause on:

- source HTML read failures
- upload failures
- app-store slug collisions
- published content mismatch
- prompt execution mismatch

### Phase 5: Cleanup

After migration is complete:

- remove v1 editor UI and old editor-only code.
- keep legacy published links forever.
- keep legacy prompt execution route forever or until we have proof no external applet HTML calls it.
- keep `Workspace.applet` linkage as a compatibility lookup unless a later migration removes workspace prompt bridging.

Do not remove runtime adapters just because all database records are v2.

## Validation Gates

Before rollout:

- `npm run precommit` passes.
- Dry-run inventory has been reviewed.
- Legacy runtime adapters are covered by tests.
- Applets page can list legacy applets.
- Migration endpoint is idempotent.

Before declaring migration complete:

- Every non-waived applet opened or batch-migrated has `version: 2`, `filePath`, applet metadata in Draft HTML, and empty `html`.
- Every migrated published applet has canonical published content fields.
- Every active app-store applet row has `appletId`.
- Workspaces no longer show the applet editor tab.
- Applets page opens migrated applets in the v2 canvas editor.
- Old workspace published links still load.
- Old workspace prompt execution still returns `{ output, citations }`.
- SDK applet data, shared data, files, model calls, and agent calls still work by applet ID.
- Production logs show no new 404/403 spikes for applet, app-store, prompt, data, or file routes.

## Known Risks

- Some v1 applets may have no recoverable HTML. Migrate them to empty Drafts and report warnings.
- Some old applet HTML may hardcode workspace endpoints. Keep adapters; do not depend only on the new SDK bridge.
- Public unauthenticated migration may lack owner context for writing Draft files. Prefer owner/admin lazy migration and conservative public legacy serving until this is proven safe.
- Duplicate app-store rows may exist after prior partial migrations. Resolve by slug and applet identity, not broad deletion.
- File migration can create orphaned media files if DB save fails after upload. Queue cleanup and keep migration idempotent.
- Workspace prompt files depend on existing legacy file healing. Reuse the current execution/file variable builder.

## Definition Of Done

The migration is done when:

- V2 canvas applets are the only editable applet experience.
- Legacy workspace applet editor UI is gone.
- Opening or editing a legacy applet migrates it to v2 and opens it as a v2 canvas applet.
- Legacy published links, app-store slugs, prompt endpoints, data endpoints, and file endpoints keep working.
- Workspace prompts are runnable from migrated v2 applets through applet-ID routes and SDK helpers.
- Runtime adapters are treated as permanent compatibility, not temporary migration scaffolding.
- Tests cover legacy records, migrated records, open/edit migration, prompt execution, publication, app-store routing, and SDK access.
