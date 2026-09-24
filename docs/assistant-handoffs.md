# Assistant handoffs and questions

Assistants send durable request/reply messages through the existing agent-tool gateway. `ListAssistants` discovers accessible identities. `MessageAssistants` starts one ordinary background agent task per message; a batch runs in parallel. The sender receives the replies in its next turn and can request the next stage. No workflow definition, stage graph, separate orchestrator, or suspended model process is stored.

`AskUser` uses the same envelope with the existing private job conversation as its destination. Team questions are relayed through the coordinator in that conversation. The stream route adds the original task, checkpoint, and file locations from server-owned records. `AnswerTaskQuestion` records the assistant's summary of the user's answer. It requires the owning user, the original assistant or job coordinator, the unshared job conversation, and a persisted user reply. A greeting or another question should not be resolved; prompts require enough information and explicit approval when the task calls for it. Closing the chat is not an answer. This is a conversational decision, not a new approval policy engine.

## State and execution

- `AssistantMessage`: source task/turn, sender, recipient or question chat, delivery state, encrypted request/checkpoint/answer. It is also the durable outbox. Delivery retries reuse deterministic message, child-task, notification and chat IDs.
- Existing `Task`: bound assistant, root ID, turn number, pending-replies flag, and encrypted original brief/latest progress. Child tasks use `assistant-run`; automation continuations retain the same task/run ID and output paths.
- Existing `Chat`: the root job conversation, with questions linked through AssistantMessage. The old optional question ID is retained only to consolidate legacy links.
- Existing Redis capabilities additionally bind the source task/turn or private chat. Model parameters cannot choose the owner, source task, root, or answer destination.

`wait=true` ends the Cortex turn after its current tool batch. `wait=false` permits independent work; at the end of the turn, a task with outgoing requests waits for all replies from that turn. The existing minute scheduler delivers outbox records, collects completed child results, and resumes ready tasks. It waits for the preceding worker heartbeat to disappear. A compare-and-set advances the turn; a deterministic BullMQ receipt makes enqueue repair idempotent. Waiting consumes no worker slot and has no human-answer timeout. It is excluded from abandoned-task cleanup and blocks overlapping scheduled runs of the same automation.

Continuation prompts contain the original instructions and data locations, the preceding turn's output, handoff checkpoints and new replies. Chat-originated work also reads the recent private source chat to preserve work completed after dispatch. They require reading the referenced files and avoiding repeated side effects. Failed child work is returned as a failure, never as approval. The final automation report is saved only after outstanding handoffs are resolved. Task pages show **Waiting for replies** and keep polling.

Parallel assistants share the user's workspace, not a document lock. Requests should give editors separate version paths; the coordinating assistant combines them after the replies. Existing files, tools, memory boundaries, notifications, and normal chat are reused. There is no cross-user messaging. Accessible shared specialists can participate under the current user's context.

## Bounds and operations

One batch accepts up to eight messages. A root task permits 64 durable messages, eight delegation levels and 32 turns per task to bound accidental cycles. Paused or archived identities cannot start another background turn. Cancelled roots do not start further child work or continuations. Existing running external operations are not rolled back. Exactly-once external tool side effects are not promised; task instructions must remain safe to retry after failure.

Deploy Cortex, Concierge web and assignment-aware workers together before enabling this flow. The existing `CONCIERGE_AGENT_TOOLS_URL` and shared Redis capability store are used. Mongo schema encryption adds `tasks.assistantContext` and `assistantmessages.payload`; routing fields stay queryable. Provision the declared `assistantmessages` indexes and the Task waiting index through the normal index rollout. No old records or reports are migrated. Local implementation does not deploy these changes.

## Progress and duplicate requests

`ReadAssistantTasks` reads the bound assistant's active work and recent results, or one exact task. Normal private chats receive a fresh compact receipt snapshot independently of conversation tool history. Shared chats do not receive private task context or access to this tool. Worker turns receive other assignments to the recipient; overlapping work should return a clarification or existing result to the sender through the ordinary reply, rather than start another research pass or delegation loop.

Dispatch returns named durable receipts. A short Redis lease serializes dispatches for the same user, assistant and chat. New chat turns are refused another outstanding request to the same recipient unless the assistant explicitly identifies a separate assignment with `separateTask`. This is a guard against accidental repetition, not semantic equivalence detection or cancellation. Existing duplicate records remain truthful history. `wait` is optional: chat continues by default; background turns yield by default.

Inbox queries count and display the parent task. Child routing is persisted before enqueue, and recipient requests remain inspectable inside the parent card. Waiting tasks participate in live polling. Progress is derived from existing tasks and messages; no new workflow state is stored. Results are pinned to the originating private chat, with normal privacy checks; delivery cannot silently fall back to a more recent conversation. Cancelling a root requests cancellation of its active descendants; completed external actions are not rolled back.

Team workflows add a shared root assignment and explicit reviewed completion on top of these handoffs. See [assistant-teams.md](assistant-teams.md) for recruitment, peer questions, reviews, and execution bounds.

## Job conversation continuity

`getAssistantConversation` resolves the root task's existing source chat. A task that began without chat derives one stable private chat ID from its root ID. AskUser appends to that conversation; team specialists relay through its coordinator. AnswerTaskQuestion accepts an exact questionId and refuses to guess when several questions are pending. Pending question context is loaded from AssistantMessage, not a single pointer on Chat. Foreground display actions use the current chat's canvas tools before the answer is recorded; the background continuation waits for that chat turn to finish and receives its recent messages.

Legacy question-only chat links copy their saved messages idempotently into the root conversation, update their question/notification destinations, archive the old link, and redirect. Original records remain intact. Shared, foreign, or active-stream chats are not consolidated. No additional durable workflow state is introduced.
