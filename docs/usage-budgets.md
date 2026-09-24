# REST usage dashboard and weekly estimated-cost budgets

Cortex supports a configurable **allowance per key per seven days** on POST `/v1/chat/completions`, `/v1/completions`, `/v1/responses`, and `/v1/messages`. Admins manage overrides using existing key fingerprints. Primary and secondary subscription keys have separate budgets. Internal GraphQL/entity work, generic `/rest/*` pathways, and model discovery are outside this meter.

## Request path and consistency

- **Warm admission:** one Redis `HGET` of current-week spend. Policies are cached in process and Redis for at most 60 seconds; their absolute expiry prevents replicas from extending stale settings indefinitely.
- **Completion:** one Redis Lua call atomically increments spend, requests and fallback counts. No Mongo operation occurs in steady request/completion handling. Duplicate callbacks on a request are ignored. Ambiguous increment failures are not retried, since they may already have applied.
- **Cold start/cache loss:** load the durable policy/anchor and last spend snapshot from Mongo. Atomic Redis initialization preserves an already-active counter if multiple workers initialize together.
- **Background persistence:** once per minute, pipeline Redis snapshot reads and write absolute totals to Mongo in a bulk operation. Per-period Redis leases coordinate replicas; Mongo `$max` prevents stale/duplicate snapshots from lowering or double-counting totals. A worker handles up to 1,000 dirty periods per pass, with memory bounded to 10,000 tracked keys. Larger backlogs take additional passes.
- **Resets:** the first admission with working shared storage anchors the window. Subsequent fixed seven-day windows require no job. Completed requests belong to their admitted week. Overrides and zero/unlimited edits preserve anchor and spend, and normally take effect within 60 seconds. The admin display reads snapshots and may lag by approximately a minute plus its refresh interval.

Pricing uses current model rates, including distinct cache rates. Missing prices use conservative estimates for provider-reported token counts; responses without reported usage are logged but not charged. At the estimated cap, return 429 with the reset timestamp and `Retry-After`. In-flight work can overshoot substantially during expensive concurrent bursts; this is not a reservation system or invoice-accurate billing.

## Outages and recovery

Availability takes priority over absolute limiting. Redis commands have short timeouts, automatic replay/offline queues are disabled, and errors trigger a five-second process backoff. During an accounting outage, check/update the last local allowance; an unknown key uses the configured default allowance. Known exhausted local budgets still reject requests. There is no per-request Mongo fallback.

Admission has a 100 ms overall deadline (`COST_LIMIT_ADMISSION_TIMEOUT_MS`, positive and at most 5000; invalid values use 100), subject to event-loop scheduling. Slow Redis, cold policy loads and snapshot recovery fall back when that deadline expires. Coalesced loads can finish in the background; Mongo operations and pool waits are bounded at two seconds. Validate admission latency and recovery under the intended deployment load.

This can allow extra spend across replicas. Unsnapshotted increments can be lost on Redis data loss, and outage/ambiguous debits may remain absent from shared allowance totals. On recovery, shared state resumes from Redis or the last Mongo snapshot; local outage estimates are not replayed. This is deliberate approximate behavior. Accounting degradation is logged at most once per 30 seconds on the request path. Failed background snapshots remain pending for retry.

Mongo snapshot failure does not block warm Redis checks. If a policy refresh or cold restore also fails, local fallback applies. Gateway suspensions and explicit revocation blocks are independent and remain effective throughout outages and weekly rollovers.

## Storage and configuration

Both apps use the same `MONGO_URI` database. Only Cortex needs quota Redis access: `COST_LIMIT_REDIS_URL` overrides its existing `STORAGE_CONNECTION_STRING`. A dedicated Redis connection isolates quota timeouts from other Redis users. All Cortex replicas must use the same Redis endpoint/database. Keys are automatically namespaced by Mongo host/database identity, without credentials; `COST_LIMIT_REDIS_PREFIX` can override this when an explicit environment namespace is needed. Keep its value consistent across replicas. Local instances without Mongo disable the feature.

Mongo `api_key_cost_limits` holds durable overrides/anchors. `api_key_cost_periods` holds snapshots and expires 90 days after the period ends; Redis counters have the same expiry. Do not delete policies to reset spend. Existing `token_usage` analytics and its 90-day TTL remain separate.

Run `node scripts/ensure-usage-indexes.mjs` to inspect indexes, or add `--apply` to create missing `token_usage.api_key_id_1` and the period `expiresAt` TTL index. Inspect the effective database before rollout and retain compatible indexes.

## Dashboard and rollout

The default Budget control tab loads policies and key labels independently of historical aggregates. It combines mapped keys, policy keys and any loaded usage keys, including inactive keys; it is not a live APIM subscription inventory. Search/filter/sort and 25-row pagination run in the browser. Saved estimates include snapshot timestamps; an absent current-period snapshot has `spentUsd: null`, not a fabricated zero. Old timestamps alone do not establish an outage because snapshots follow activity. A policy refresh failure leaves last data visible with a warning and disables edits. Responses explicitly flag a 10,000-policy truncation. Fingerprint/label reads and policy reads/writes require admin access and use private, no-store responses.

Cap writes validate the browser origin against the public request host and protocol. Azure ingress must overwrite `X-Forwarded-Host` and `X-Forwarded-Proto`; these take precedence over `Host` and the internal Next.js URL. Cross-origin or malformed origins return 403 before any database write.

Each key exposes inline cap editing, unlimited and zero caps, default restoration and cancellation without resetting spend/anchors. Budget CSV exports the filtered set and neutralizes formula-like labels. Key activity retains model/interval drilldown and CSV. Historical queries only start when an activity tab is selected; the budget controls remain usable when history queries fail. Both English and Arabic help explain snapshot uncertainty, independent weekly anchors and revocation boundaries.

The dashboard derives model/key/day views from one aggregate, with bounded 60-second process caching, coalesced requests, at most two concurrent Mongo queries per process, and bounded Cosmos throttling retries. It never presents failed/partial queries as complete totals. Historical estimates use current configured prices and mark missing prices/token breakdowns as incomplete.

Before enabling a finite allowance, configure prices and verify usage reporting with dedicated test credentials. Exercise cap edit propagation, zero/unlimited limits, 429/reset time/Retry-After, metered streaming and non-streaming requests, missing usage reports, snapshot display, and independent revoked-key checks. Use isolated state for reset-boundary tests. Preserve existing spend and anchors during upgrades.

Rolling back the dashboard leaves Cortex enforcement active. Rolling Cortex back to a version without the accounting middleware removes enforcement while preserving policies and snapshots. Verify the behavior of the exact version selected for rollback.

Set `CORTEX_DEFAULT_WEEKLY_COST_USD` to the same value in Cortex and Concierge: a nonnegative amount or `unlimited`. The default is unlimited. Per-key overrides take precedence.
