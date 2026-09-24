# Teams of assistants

A user can ask an assistant to assemble specialists and deliver a project. The assistant becomes its coordinator. It discovers existing assistants, delegates independent work in parallel, and chooses each subsequent stage from the results. Roles are instructions: the same mechanism supports software, research, publishing, design, and other work.

The previous handoff system already supplied identity-bound execution, durable messages, joins, user questions, notifications, and continuation. It lacked shared assignment context, recruitment, and an explicit distinction between finishing a turn and finishing the job. Teams add those pieces without a stage engine or another queue.

## Durable state

The root `Task` stores one encrypted `assistantTeam` object: goal, acceptance criteria, coordinator, roster, workspace directory, working plan, decisions, and final result. A numeric revision supports optimistic updates. Children use the existing `assistantRootId`. `AssistantMessage` remains the assignment ledger and outbox; the board is derived from it and task results. Documents stay in the shared workspace, under `/workspace/teams/<rootTaskId>` by convention.

A specialist's encrypted `assistantOutcome` seals its final handback. It includes an outcome, summary, evidence, and artifact paths with SHA-256 hashes. Continuation uses the existing turn counter and queue, plus a self-continuation flag. Automatic repair allows two turns to correct a missing handback, then fails visibly with checkpoints preserved. It never silently labels partial work successful.

`StartAssistantTeam` starts from a private chat. `ReadAssistantTeam` shows the team's current records. `RecruitAssistant` requires an existing accessible assistant ID. Stable role keys make retries idempotent without creating or editing assistant definitions. Shared assistants execute in the recruiting user's workspace, with that user's private memory and connections.

Any member can recruit or record decisions. The coordinator owns the plan and final delivery. `UpdateAssistantTeam` requires the revision that was read. Goal and acceptance criteria remain the original brief. Existing per-user tool permissions, memory isolation, and ownership checks apply. A peer message never supplies user consent for publishing or other external actions.

## Work, questions, and reviews

`MessageAssistants` distinguishes three purposes:

- `assignment`: execute a stage, returning `completed` or `blocked` through `CompleteAssistantTask`.
- `question`: answer a clarification in a separate short invocation. This can reach a coordinator who is waiting for that specialist, without a dependency cycle. The recipient must not restart its assignment or delegate another question. Its ordinary reply returns to the asking task.
- `review`: inspect artifacts and return `accepted`, `needs_revision`, or `blocked`, with evidence and exact file hashes. Review requests declare their input paths and hashes in `reviewArtifacts`; the handback must include those input versions, so a QA report cannot accidentally stand in for the files reviewed.

Only one assignment/review can be outstanding for a teammate in a team. Separate question invocations remain possible. Sequential work starts after the previous handback; independent entries in one batch run in parallel. Writers receive distinct paths. The coordinator resolves blocked results and requests revisions when review findings require them.

`AskUser` and `AnswerTaskQuestion` reuse the existing notification and private question chat. Waiting releases the worker. Replies and saved checkpoints brief a fresh turn; assistants do not poll. `ContinueAssistantTask` saves work needing another turn even when there are no outgoing requests.

`FinishAssistantTeam` is restricted to the root coordinator. It rejects outstanding work, missing reviews, rejected versions, self-review by a recorded producer, and hashes that differ from the accepted review. Final evidence has one entry per acceptance criterion. The runtime delivers the coordinator's recorded summary once through the original private chat. Final reports include stable authenticated artifact links. Download requests bind the logged-in owner to a saved final artifact, verify its SHA-256 against the actual workspace bytes, and serve an attachment without exposing workspace credentials or expiring signed URLs. Each download is limited to 32 MB; files must remain available in the workspace/checkpoint. Changed or missing bytes fail closed. Review receipts are evidence reported by assistants; the server checks their provenance and version correspondence, not the correctness of claims or file hashes. Specialists must inspect the files and run appropriate tests.

## Bounds and recovery

Teams use the existing limits: eight messages per batch, 64 per root, eight delegation levels, and 32 turns per assignment. Recruitment adds a 12-member limit. Exhaustion or repeated missing handbacks produces a visible failure; it is not approval or success. Cancelling the root stops subsequent execution and requests cancellation of active descendants. External effects already performed are not rolled back.

Mongo updates record obligations before queue delivery. The scheduler retries outbox delivery and repairs continuation enqueue gaps. Recruitment reuses the saved member on retries and never creates an identity. A short per-root lease serializes team mutations and dispatch; concurrent team writes wait briefly for the lease rather than failing immediately; Mongo revision checks also reject stale plan writes. This does not promise exactly-once external tool effects.

No migration of earlier reports is needed. Deploy Cortex, web, and workers together; `tasks.assistantTeam` and `tasks.assistantOutcome` must be added to the same client encryption schema on every writer before enabling teams. Provision the Task `{ owner, assistantRootId }` index for the derived assignment board. Existing chats, notifications, and the Assistants directory remain the user interface.

Run `node scripts/ensure-background-indexes.mjs --apply` with the target environment's `MONGO_URI` before deploying team views. Cosmos also requires the exact sort indexes: Task `{ createdAt: -1, _id: -1 }` for pagination and AssistantMessage `{ createdAt: 1, _id: 1 }` for assignment history. Verify the actual sorted queries; single-field indexes or compound indexes with an owner prefix do not satisfy these sorts.
