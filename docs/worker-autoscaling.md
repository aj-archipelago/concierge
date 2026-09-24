# Worker queue scaling

The worker Container App has no ingress. Its HTTP rule does not measure BullMQ work. The replacement uses ACA's supported `redis` scaler, initially using **6–12 replicas**, targeting **20 task jobs per replica**, with 30-second polling. The task worker's concurrency remains 20. These are starting values, not measured capacity claims.

## Metric

Each worker runs a small publisher. Redis arbitrates samples at most once every ten seconds, using its own clock. One Lua script reads the queue state and publishes the sum atomically:

`active + waiting + prioritized + delayed jobs that are due + admission-deferred background jobs`

Ordinary future delayed jobs, waiting-for-children jobs, and completed/failed history are excluded. Background jobs delayed only by the shared admission budget remain runnable demand; the publisher verifies at most 241 admission markers against the delayed set per sample and removes stale markers. When the queue is globally paused, only active work contributes. No producer or BullMQ queue state is changed by the publisher.

KEDA reads `LLEN bull:task:autoscaling:work`. This is a **separate list of anonymous counters**, not a BullMQ job list. It is capped at 240 entries, enough to request the maximum 12 replicas. Demand and component counts (with admission-deferred sampling bounded at 241) are stored in `bull:task:autoscaling:snapshot` and logged as `task_scale_metric`. The two keys use the same Redis endpoint/database as `bull:task:*`.

The metric deliberately has no expiry: loss of publishing must not turn a previous high count into a zero signal. Check that `sampledAt` is less than 60 seconds old; stale samples can hold excess replicas or delay scale-out and need investigation. If all publishers fail, the six-replica minimum remains. Do not enable this design with a zero-replica minimum. Redis read errors are scaler errors, not an empty queue.

The existing queue monitor also logs `queue_health`, including `active`, `waiting`, and `oldestWaitingJobAgeMs` for each queue. Age is measured from the oldest timestamp in a bounded sample of up to 100 waiting/prioritized jobs; it is a lower bound when priorities hide older work. Waiting counts and completion-window counts are obtained directly from Redis. A retried job retains its original age. Paused queues suppress pending-work alerts. A waiting job aged five minutes triggers the existing worker alert even when no jobs have completed; the existing 30-minute alert cooldown still applies. This is separate from the fast scaling publisher, so alert delivery cannot block publishing.

## Startup and scale-in

Replicas reuse an existing digest repeat schedule without removing queued, delayed, or active jobs. Changing its interval requires deliberate schedule reconciliation during a release window. Task, digest, and automation consumers start once per process. Fatal startup/run failures drain the process and let the container platform restart it.

Node runs directly as the container command. One signal handler stops all three consumers from fetching, stops monitoring, waits for active jobs and their BullMQ locks, then closes queues, MongoDB, and Redis. The digest processor no longer closes shared MongoDB after each job.

The proposed template sets `terminationGracePeriodSeconds: 600`, the maximum ACA accepts, replacing its 30-second default. This is a finite drain budget, **not a guarantee that every job finishes**. Most task timeouts remain inactivity timeouts. Digest and automation runs also have a 20-minute total budget, while periodic digests only dispatch per-card jobs. A job that outlives the grace period, a process crash, or a platform interruption can still be retried by BullMQ's stalled-job recovery; side effects are not exactly-once. Digest and automation execution claims prevent automatic replay of an already-started agent; interrupted runs require review. See [background execution](background-runs.md). Confirm actual longest jobs and scale-in behavior in dev before enabling production scaling. Increasing the active-work count helps avoid premature scale-in but does not control which replica Azure removes.

`cooldownPeriod: 300` is KEDA's cooldown toward zero, not a configurable delay for every 12-to-6 transition. ACA manages the HPA behavior for nonzero replica changes. Do not treat the cooldown as additional job drain time.

## Configure your worker platform

Deploy the updated worker image before enabling scaling based on its queue metric. Configure the platform to read the Redis metric published by this installation; use separate queue prefixes and credentials for each environment. Set a termination grace period long enough for typical work and inspect the behavior of tasks that exceed it.

Export the current service configuration before changing replica limits or termination settings. Keep the export as a rollback reference. Verify the worker image, metric freshness, oldest waiting age, and active-task completion under a mixed foreground/background load. Replace a worker while a task is running and confirm that interrupted agent actions are not automatically replayed.

Application builds do not apply infrastructure settings. Operators must adapt scaling to their own platform, capacity, and provider limits. Do not enable a new scaling rule for old workers that lack the metric or graceful draining.

References: [Azure Container Apps scaling](https://learn.microsoft.com/en-us/azure/container-apps/scale-app) and [KEDA Redis list scaling](https://keda.sh/docs/2.18/scalers/redis-lists/).
