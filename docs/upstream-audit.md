# Upstream Audit

Use the upstream audit command before porting changes from a downstream fork or
private distribution back into Concierge. The command is intentionally read-only:
it does not merge, commit, push, open a browser, or create a pull request.

## Basic Use

```sh
npm run upstream:audit -- --source-url ../my-downstream-fork --source-branch main
```

The command compares the downstream source with the current Concierge checkout,
then reports:

- commit divergence
- diff size and directory spread
- changed files grouped by feature area
- optional forbidden-pattern scan results

## Forbidden Pattern Scans

Keep organization-specific terms, internal hostnames, tenant IDs, and private
deployment names outside this repository. For private audits, pass those checks
in a local JSON file:

```sh
npm run upstream:audit -- \
  --source-url ../my-downstream-fork \
  --pattern-file ../private-upstream-patterns.json
```

Pattern file format:

```json
[
    {
        "id": "product-brand",
        "severity": "blocker",
        "pattern": "\\bExample Product\\b",
        "flags": "i"
    },
    {
        "id": "internal-secret-env",
        "severity": "review",
        "pattern": "\\b[A-Z0-9_]*SECRET\\b"
    }
]
```

Use `blocker` for findings that must be removed before a public pull request.
Use `review` for findings that may be acceptable only after human inspection.

## Staged Porting

Do not port a large downstream diff as one pull request. Use the clusters in the
audit report to create small, reviewable branches:

- app shell, chat, and canvas architecture
- file manager, storage, and scoped file access
- applets, SDK, and shared data
- media generation UI and worker plumbing
- automations, connectors, and MCP
- help, release notes, and user-facing docs
- configuration, auth, and deployment cleanup

For each branch, sanitize product names, sample content, environment variables,
deployment configuration, and optional connector credentials as part of the same
change. Validate with Concierge's own tests and build before opening the public
pull request.
