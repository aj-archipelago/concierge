# Publishing HTML task output

The automation runner accepts complete inline HTML or a file produced during the current execution attempt. This fixes reports that were written to storage but replaced by a placeholder in the final response. The Tasks interface uses the same automation runner and storage layout.

At each start, the worker generates a UUID and persists it as `metadata.outputAttemptId`, retaining earlier attempt IDs for scoped cleanup. The agent receives the exact cloud-backed directory:

```text
/workspace/files/automations/<slug>/outputs/<taskId>/draft-<attemptId>/
```

The agent may write `result.json` with `summary`, `html`, and `widgetHtml`, or write `index.html` and an optional `widget.html`. It closes the files before completing. The final response may then be a short summary or empty. Scratch files and paths mentioned in a model response are not imported.

Publication proceeds in this order:

1. Use usable inline report HTML when available.
2. Otherwise read the current attempt's `result.json`.
3. Otherwise read its `index.html` and optional `widget.html`.
4. Sanitize and validate the selected documents, then save them through the existing automation output writer. Persist the actual published HTML in the task result and record the selected source in `data.outputPublishing`.

Validation rejects empty output, known whole-report placeholders, path-only output, visibly truncated full documents, and content removed entirely by sanitization. Useful small reports, fragments, Arabic text, and image-based output remain supported. This is publication validation, not a factual or visual quality assessment. An absent or invalid widget falls back to the full report.

Artifact reads use an exact-path read grant in the owner's storage, a 15-second timeout, no redirects or fetch cache, and a 2 MiB byte limit enforced while streaming. No user-wide scan, filename search, URL from the model, or modification-time guess is used. A fresh attempt directory prevents earlier runs, retries, or incomplete handoffs from becoming the new report.

If no usable report exists, the handler returns a publishing error. The executor marks the run failed without replaying the agent's tools. The latest-report pointer remains unchanged. Scheduled dispatch already advances the next scheduled run; failure releases its lock. The output directory is nested under the run's existing `outputs/` prefix, so drafts are excluded from supporting attachments. Retention includes only the three designated files in each recorded attempt directory; it never deletes arbitrary files or folders.

The runner remains compatible with existing automation records and inline-only results. Existing in-flight jobs without an attempt UUID can finish with usable inline HTML; they cannot recover arbitrary legacy scratch files. No data migration or prompt edit is required.

A waiting assistant turn is still parked before publication. A resumed turn receives a fresh destination in its current system instructions, overriding the original brief's earlier destination. It can read its checkpoints and copy finished work into the current directory. Existing citation validation runs on the selected report and widget before either is written. Generic assistant tasks keep their existing output behavior.

The regression tests cover the observed placeholder forms, both file formats, missing final text, invalid widgets, truncated documents, prior-run isolation, retry destinations, sanitization, bounded reads, publication failure, and the existing text-output behavior. Tests also cover waiting/resume and citation handling for recovered files.
