# Concierge storage grants

Concierge is the authorization authority for Cortex File Handler. The server signs a short-lived RS256 bearer grant after checking the authenticated user and the final file target. Cortex and workers pass that grant to CFH; their service identities are not bound into it.

Start with CFH audit mode: allow every unsigned call and log each one. Reject invalid supplied grants. Keep production held for review and enable mandatory grants only after reviewing the caller inventory.

Configure `CFH_GRANT_PRIVATE_KEY`, `CFH_GRANT_KEY_ID`, `CFH_GRANT_ISSUER` and `CFH_GRANT_AUDIENCE` on Concierge web and workers. Configure matching public keys on CFH and Cortex first. Use separate secrets/audiences per environment and set `CFH_CLIENT_NAME=concierge-web` or `concierge-worker` for attribution. Private keys are runtime secrets and must never be browser/build arguments.

Browser GraphQL POSTs now pass through an authenticated Concierge route. Subscriptions continue through the websocket rewrite. Server routes use `app/api/utils/cortex-client.js`; workers bind the persisted task owner's principal. File calls use `authorizedMediaFetch`, which authorizes the final owner/scope, adds canonical routing and attaches a grant. Caller-provided grant headers and target arrays are not accepted from browser requests. Streaming multipart uploads retain streaming behavior; JSON proxy requests are inspected within CFH's existing 100 KiB JSON limit.

Article and applet snapshot helpers receive records after their enclosing routes authorize access. They issue exact-object grants, including for authorized public snapshot reads. They must not be called with an unverified client-supplied record. Shared applet mutations require owner/editor access; readable shares alone do not grant write access.

Grants expire within one hour and currently cannot be renewed within an existing Cortex run. Existing persisted upload URL lifetimes are preserved. The unsigned audit path remains open until enforcement is explicitly enabled.

The [Cortex storage-grant guide](https://github.com/aj-archipelago/cortex/blob/main/docs/storage-grants.md) describes the grant contract and rollout order. Client labels and source headers are diagnostic hints, not proof of identity.

Configure `NEXT_PUBLIC_STORAGE_ORIGINS` with the exact comma-separated storage origins used by this installation. It contains public hostnames, never credentials. Configure `CORTEX_STORAGE_CONTAINER_PREFIXES` with the file handler's container prefixes so saved profile images and applet covers can resolve their owner. Unconfigured cloud origins do not acquire storage authority. Local Azurite origins are recognized only outside production.
