# Home widget generation

First-time Home widgets use `POST /api/canvas-applets/:id/widget`. The endpoint requires owner/editor access, reuses existing widget HTML, and saves a completed generation on the server even if the browser disconnects. Store viewers retain the existing full-applet fallback.

Redis coordinates requests across web instances. There are two generation slots per database environment, plus one operation per applet. Keys use a hash of the Mongo host/database without credentials, so blue and production remain separate even when their queue Redis binding is shared. The browser also limits itself to two pending preparation workflows; saved widgets bypass that queue.

Completed HTML and failure state expire after 24 hours. A failed database save can reuse the completed HTML on any web instance. Generation failures require the tile's Retry action during that retention window. A lost process holds its slot for at most 15 minutes; after the lease expires, the same source requires an explicit retry. This is request-owned work with recovery state, not a durable worker job. A process restart before checkpointing may require another generation.

Automatic preparation and manual regeneration use a bounded author/preview/repair loop: at most three model calls of 150 seconds each and three browser reviews capped at 60 seconds each. Redis leases last 15 minutes. Coordination failure prevents new generation. If both Redis checkpointing and the database save fail, the UI reports an interrupted operation rather than promising a save-only retry.

Saving checks edit permission again and atomically fills only an absent widget on the unchanged applet. A concurrent manual widget save wins; source edits prevent stale output from being saved. Incomplete SSE output is rejected rather than treated as finished HTML.

This change deploys with the web application. It uses the existing `REDIS_CONNECTION_STRING` and `MONGO_URI`; no worker deployment, collection migration, or new setting is required. Existing widgets can be repaired independently of this code change.

The coordinator integration tests start their own temporary Redis server when `redis-server` is installed; otherwise those cases are skipped. Run them explicitly with:

```sh
npm test -- --runInBand --runTestsByPath app/api/utils/widget-generation-coordinator.test.js
```

## Widget design review

The author receives the shared design contract in `src/utils/homeWidgetCraft.js`. Every candidate is rendered at 360×320 and 560×320 in English/LTR and Arabic/RTL, in both themes. The reviewer measures clipped controls, page overflow, readable type, text/placeholder contrast on solid backgrounds, accessible names, keyboard reachability, and Arabic copy. It gives the author a labeled contact sheet plus measured failures. At least one visual repair pass is required; a candidate still failing after three attempts is not saved. The model's visual judgment supplements the measurements; it is not a guarantee of aesthetic quality or a full functional test.

Preview Chromium has no account cookies or storage. The SDK is inert; media, agent calls and writes cannot run. Network requests are blocked except the document and the fixed Tailwind script, which the server supplies from a trusted cached copy. Generated imagery and live results are therefore reviewed in their fallback state. This does not exercise successful API results, WebGL dependencies, or every interaction.

Manual **Regenerate widget** uses the same Redis coordinator and review loop, then returns an editable preview. It does not replace the saved widget until **Save widget**. Automatic missing-widget preparation still fills only an absent widget on the unchanged source. Existing widgets are not swept or regenerated on a prompt update.

The web image includes Playwright Chromium and its OS libraries. Local development requires `npx playwright install chromium`. Chromium sandboxing is enabled; a host that cannot launch the sandbox fails preparation rather than skipping review. The renderer adds browser CPU/memory cost to the existing two-generation limit. No worker deployment is needed.

Run the real browser regression checks with `node scripts/test-widget-preview.mjs` after installing Chromium. Jest covers bounded retries, failed review, permissions, source changes and save behavior.
