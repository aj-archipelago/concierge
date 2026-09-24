# Citations by output format

Cortex accepts `citationFormat` on `sys_entity_agent`: `markdown` (default), `html`, or `mixed`. Unknown values use the Markdown default. HTML automations send `mixed`: `summary` keeps Markdown directives and its saved `tool.citations`; `html` and `widgetHtml` contain ordinary source links. Text automations send `markdown`. Chat and digest callers keep their existing defaults. HTML artifacts created within a Markdown conversation use the HTML rules inside the artifact.

URLs must come from actual source records. Prompts prohibit fabricated URLs and substituting a searchResultId for a destination. A source without a usable URL should be identified by its supplied title with the missing link stated. Prompt guidance cannot prove that every linked claim is supported by its source.

New automation HTML is checked before either output file or the latest-run pointer is written. Raw citation markers, including encoded or fragmented markers, are rejected. Code examples, scripts and native Markdown payloads are excluded from this static check. Read-time sanitization does not run the check, so old reports remain unchanged. A citation-format failure marks the run failed without replaying the agent's tool calls or rewriting a previous successful report.

Applet generation applies the same check. Coordinated Home widget generation defers it to the bounded visual review loop so the model can repair its candidate. The browser review also detects markers inserted dynamically into visible content. Dynamic agent responses still use `ConciergeSDK.agent.render`, which receives the original Markdown and citation metadata.

Deploy Cortex before the Concierge worker that sends the new GraphQL argument, then the web app. No migration or backfill is included. Generation checks do not inspect arbitrary files independently written through workspace tools; those receive the format-aware Cortex instructions.
