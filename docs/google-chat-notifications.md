# Google Chat notifications

Concierge sends feedback and worker queue alerts to separate Google Chat incoming webhooks:

| Setting                            | Consumer                                                           |
| ---------------------------------- | ------------------------------------------------------------------ |
| `GOOGLE_CHAT_FEEDBACK_WEBHOOK_URL` | Concierge web app `/api/feedback`                                  |
| `GOOGLE_CHAT_WORKER_WEBHOOK_URL`   | Worker queue monitor                                               |
| `GOOGLE_CHAT_NOTIFICATION_ENV`     | Optional environment label, such as `dev`, `blue`, or `production` |

The full webhook URL is a credential. Store it in local `.env.local` or Azure app settings/Container App secrets, never source control or logs. Configure the web setting separately in dev, blue and production; keep the environment label sticky to the App Service slot. Configure the worker setting through a Container App secret reference. Each webhook belongs to its intended Chat space. Separate test spaces are supported by giving dev different URLs; if a space is shared, environment labels distinguish notifications.

Feedback is saved before background notification. Cards include submitter, user/agent source, category, page context, message, optional screenshot and an admin link. Submitted card text is escaped. A fresh SAS image waits at most five seconds before delivery. Feedback remains available in Admin even if delivery fails.

Worker alerts preserve queue failure-rate and pending-job details, monitoring windows and cooldowns. The cooldown advances only after a successful delivery. A missing worker webhook never falls back to the feedback space.

Webhook requests have a ten-second timeout and reject redirects. Only a definite HTTP 400 rejection of the rich card triggers a plain-text fallback. Rate limits, server failures and uncertain timeouts are logged without webhook URLs or response bodies; they are not blindly retried into duplicate messages. These notifications are best-effort, not a durable delivery queue.

Neither path uses `SLACK_WEBHOOK_URL` after this change. Other Slack connector features are separate from these two notification feeds. Keep any Slack configuration still needed by an older deployed version until that version is replaced.

Before declaring a switch live, verify the active web and worker image SHAs, then send labeled synthetic feedback and worker samples to their respective spaces. Changing environment settings alone does not switch an older Slack-only image. The held 4.1.2 chat-storage release remains a separate deployment decision.
