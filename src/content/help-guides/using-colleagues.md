---
id: using-colleagues
title: Working with AI assistants
category: productivity
date: 2026-09-14
---

AI assistants have names, specialties, memories, and their own conversations. Open **Tasks** → **Assistants**, marked by the Wisp outline in the sidebar, choose **New assistant**, and give them a name and a specialty. Choose a Wisp portrait in indigo, teal, amber, coral, blue, or orchid, and describe how you want them to work. Wisps float, glance around, stretch, and sway. Hover over a portrait or assistant card to get their attention; all visible Wisps turn toward your pointer as it moves across the page, with their eyes leading the turn, then relax when it stops. Tap a portrait for a small hop, wiggle, or nod. Keyboard focus and selection also get a response. They settle back into the same resting pose and stay still when reduced motion is enabled on your device. The researcher, editor, and analyst examples can help you start.

The Wisp at the start of the chat header identifies who you are talking to. Use the name selector beside it to switch assistants; the Wisp changes with your selection. Files, available tools, sharing, and more actions remain in the same compact header, with the actions on a second row on small screens. A thin divider separates the header from the conversation and matches the separator beside the assistant selector. The same portrait appears in the selector menu and docked chat. While you type, the Wisp perks up. It adopts a focused motion while thinking or using tools, pulses gently while replying, and nods once when the reply finishes. A questioning tilt signals a confirmation request, and a brief concerned motion accompanies an error. Stopping a reply returns it to rest. These reactions follow the current conversation and respect reduced-motion settings. Use **Open chat** to talk to that assistant using the normal chat interface, including files, skills, connected services, and agent tools. **Edit assistant** changes their name, portrait, and instructions.

Use **Show archived** in the app header to include archived assistants in the list. On narrow screens, this toggle uses an archive icon.

## Catch up, assign tasks, and work together

When the sidebar shows a dot on **Tasks**, opening it takes you to **Recent** for unread task results and assistant messages. Without a dot, it opens **Assistants**. **All tasks** opens only when you choose it. You can switch tabs at any time; reading the last update keeps you in your current view.

**Recent** lists your assistants’ latest finished work. Each row pairs an animated wisp with the assistant, task, and completion time. New results are labelled **New**. Select a row to open the report separately, and use **Back to recent work** to return. The list shows each task’s latest completion; older runs remain in its history.

Use **Mark as read** after reviewing a result. Other unread results keep their indicators, and a later run appears as new again. These indicators are saved in this browser. New assistant messages and requests for help appear above recent work.

**All tasks** holds all tasks and schedules, including work that hasn’t run yet. **Assign a task** lets you choose an assistant and describe what you need. A task can happen once, on a schedule, or when files change. Select a task to read its report or change its settings.

**Assistants** opens a directory of your assistants. Choose an assistant to chat, assign them a task, or open their tasks, options, and memory. Profiles open separately; **Back to assistants** returns to the directory.

A colleague conversation keeps its selected colleague while the list refreshes. If that colleague is unavailable, the conversation will not switch automatically to your personal assistant.

## Starting a conversation

On a new, empty chat, the assistant may open the conversation after three seconds of inactivity in the visible, focused tab. The opening is generated using their identity, selected model, and available memory. Typing, pasting, dictation, or starting an upload leaves the first turn to you, even if you later clear the draft. Pointer activity delays the opening, and returning from another tab gives you a fresh grace period. If you start interacting while the assistant is composing the opening, it is discarded quietly. Existing conversations do not receive these openings.

Every assistant, including shared specialists, uses an animated Wisp. Each has a consistent individual shade; created assistants use a variation of their chosen color. The same color follows them through the assistant list, detail panel, and chat selector.

## Choose options and memory

Your personal assistant has a polished gold Wisp, reserved for that identity. In card view it appears first, followed by your created assistants and the shared specialists available to you. Select any assistant and open **Options** to choose its model, reasoning effort, and whether it can learn and save memories. These choices apply to your chats and tasks with that assistant. For shared specialists, these are your own preferences; their owner still manages their identity and tools.

Click **Powered by** in the footer to change the model for the assistant selected in Tasks or the current chat. Elsewhere, it selects your personal assistant's model. Assistant settings now live here instead of the Personalization dialog.

Open **Memory** to inspect or edit the selected assistant's memories. Your personal assistant keeps its existing memory. Each other assistant starts with separate self, directive, topic, context, and user-fact memory. Nothing is copied from your personal assistant or another assistant. Shared specialists also have separate memory for each user. Disabling learning prevents automatic memory updates and memory-tool writes; existing memories remain available for reading.

Shared workspace files remain accessible to your assistants. Existing conversations retain anything already said in them. Memory separation does not hide shared files or remove facts from old conversations.

## Assign tasks

Choose **Assign a task**, describe the work, and select a schedule. Each task keeps its history, supporting files, reports, sharing, and Home widgets. To assign an existing task, open its editor and change **Assistant**. Existing tasks keep using your personal assistant until you assign them.

In the task's Schedule tab, **When files change** watches a folder such as `/workspace/inbox`. Enable the task in Overview and save. The first observation establishes a baseline. Subsequent changes must appear unchanged on two checks before starting a run. Checks happen about once a minute while the workspace is running. Monitoring does not wake an idle container. Hidden files, symlinks, dependency folders, cloud mounts, and folders over 5,000 files are excluded or rejected. Choose a dedicated input folder and save outputs elsewhere to avoid triggering the task again.

## Work together and get updates

Your assistants share your personal workspace container and the same files and installed tools. Each has a stable directory for notes and working files. These directories organize work; they are not private boundaries between assistants. Give different assistants separate output paths when their work overlaps. Workspace resets and secrets are managed through your personal assistant.

Every assistant—your personal assistant, assistants you create, and shared specialists—can send results and requests for help to your notification inbox. Messages go only to the user they are working for. Each inbox message shows their miniature Wisp, name, and message. Click anywhere on the message to open its destination: a private chat by default, or a result, applet, or web page when the assistant supplies a link. For example, ask: “Notify me when the report is ready, and link the notification to the report.” Messages sent during chat are delivered before the assistant confirms success, and the inbox refreshes when the reply finishes. Background notifications appear on the next inbox refresh. A task that needs your input can send a question to your notifications. Open it to discuss the question in the existing private job conversation. Once your answer is clear, the assistant records it and the background task continues automatically, usually within a minute. The task can wait immediately or keep doing independent work first. Opening or closing the chat does not answer the question.

Under **Options**, **Pause tasks** prevents new runs while keeping chat available. Work already running can finish. **Archive assistant** keeps their chats, files, and task records and stops new work. Select **Show archived** in Assistants, open the assistant, then **Make available**, to restore them.

## Ask assistants to manage their work

You can ask an assistant to read or change their own name, instructions, portrait, availability, model, reasoning effort, or memory-learning setting. Changes take effect on the next turn or task run. Shared specialists keep their owner's identity settings; your model and memory preferences remain yours.

Ask them to create, list, read, reschedule, run, or delete their tasks and inspect past runs. For example: “Every weekday at 8, review the files in our inbox and send me a summary.” Tasks created in that conversation stay assigned to that assistant. They can use the same tools during a scheduled run, without an open browser. Their task tools work on your tasks assigned to them; use the editor to reassign work between assistants.

Opening a task before its first run shows **Waiting for the first run**, with **Run now** and **Edit** actions. Once it runs, the page shows its status or result.

Use **Close (×)** or **Escape** to dismiss the task or assistant form. Browser **Back** also closes it and returns to the previous view. On phones, header actions use icons with the same functions as their desktop buttons.

## Work across assistants

Ask an assistant to involve other assistants by role: “Have the researcher check the facts and the editor review the style in parallel. Combine their feedback, ask me to approve the draft, then prepare the final document.” The assistant can discover available assistants and send each a request. Independent requests run in parallel; later stages begin after their required replies. Each assistant keeps its own identity, instructions, memory, and tools.

Documents stay in your workspace. Each handoff carries the current stage, a short progress note, and the file paths the next assistant needs. Parallel editors should save separate versions so they do not overwrite each other.

If your input is needed, the notification returns to the existing job conversation with the coordinator. Discuss the question normally. When the answer is clear, the assistant records your decision and the task resumes with that answer and your conditions. Rejection is passed back too; silence is never approval. A task marked **Waiting for replies** is paused between turns and can remain that way while you are away. Other independent work may continue. You do not need to rerun the task.

Ask “What are you waiting for?” to get the assistant’s current task status, including who has replied and who is still working. Status questions do not start new assignments. Assistants also check their own active and recent assignments before repeating work; if two requests appear to cover the same thing, they can return a clarification to the sender.

Team jobs appear as one card in Notifications. Open the card for the team page, **Answer in chat** to respond, or **View results** for completed work. The team page holds individual requests, reviews, and the confirmed **Stop job** action. Results stay in the job’s private conversation; if it becomes shared or unavailable, private delivery stops.

## Ask an assistant to assemble a team

In a private chat, describe the result you want and any constraints. For example: “Build a small arcade game. Assemble a developer and tester, review it, and give me the playable files.” Or: “Make an article: research it, check the facts, write and edit it, and prepare the artwork. Keep it as a draft.”

Your assistant coordinates the job. It recruits existing assistants that you can access. A project never creates more permanent assistants automatically. If a role is missing, create a reusable assistant in the directory, then recruit it. The team shares a brief, plan and project folder. Independent stages can run together; later stages receive the earlier work. Specialists can ask each other questions and request revisions.

Ask the coordinator “Who's working on this?” or “What's still needed?” for the team's current status. You can keep chatting while work runs. If someone needs your answer, their notification returns to the same job conversation; answering there lets that task continue.

The coordinator delivers the final result after independent review of the final files. A stopped task, unanswered question or rejected draft is not a completed project. Teams have limits on members and execution turns; if they hit a limit or cannot complete a stage, the task shows a failure with its saved work preserved. Creating a team does not authorize publishing, deployment or other actions you have not requested.

Final reports include private download links for the reviewed files. Downloads check that the file still matches the accepted version, so a changed file will not silently replace it. Each file can be up to 32 MB; files must remain available in the team workspace.

## Permission checks

When automatic permission review is enabled by your administrator, routine workspace reads can proceed immediately. Actions that need closer inspection are checked before they run. Independent work can continue while a check is pending.

If a check denies an action or cannot establish permission, that action does not run. Your assistant can explain the block and continue permitted work. A review timeout also leaves the action unexecuted. An assistant's message claiming approval does not grant permission, and a chat reply cannot override an administrator's policy.

## Configure and share assistants

The directory adapts to its size: up to six assistants use large cards, seven through eighteen use compact cards, and larger directories use a list. Choose **List** at any time; your choice stays on this browser. Search filters the directory without changing its layout.

List view works like the file manager: compact rows show each assistant’s name, role, model, status, access, and new-result count. Select a column heading to sort; select it again to reverse the order. Search names, roles, or models, and combine status and access filters to narrow a large directory. The result count shows how many match. Select a name or row to open the assistant; returning to the directory restores your search, filters, and sort order in this tab. On narrow screens the list keeps names, status, and new results visible. Card portraits animate; list portraits stay still for easier scanning.

Choose **New assistant**, describe its job, and select **Draft with AI** to generate a name, short description, and working instructions. Review or edit the draft before saving. Under **Options**, an author can make the selected model the assistant default; each user can still choose their own model preference.

Open **Materials** to upload reference files or a skill folder. Skill folders keep their structure; a skill uses `skills/<name>/SKILL.md` with its supporting files alongside it. Root `AGENTS.md` instructions and skill instructions are loaded when the assistant runs. Other materials are available through its file tools. Attached materials accompany the assistant in chat and background tasks for every user who can access it, including when an applet also supplies files. Upload only material you intend those users to see.

Owners can keep assistants private, share them with selected people, or make them public in the directory. Viewers can use the assistant and read its materials. Coauthors can change its identity, default model, and materials; only the owner changes sharing or pauses and archives it. Public assistants are available to signed-in users.

Sharing supplies the same definition and reference files. Each assistant runs using the current user's workspace, connections, permissions, and separate memory. Your private files and credentials never become assistant attachments automatically. Teams recruit the definition into the current user's project. Definition changes apply to subsequent runs; active runs may already have loaded the earlier instructions. Revoking access or archiving prevents subsequent use, but does not undo work or erase copies already read.

Each active background turn has a 20-minute limit. Waiting for your answer or another assistant releases the worker and does not consume that time. A valid reply starts a fresh turn with the saved context; an interrupted turn is not silently replayed. Stopping the task also requests cancellation of its running assistant calls.

## Follow a team's work

When an assistant starts a team in your private conversation, a team strip appears below the chat header. Your coordinator is surrounded by the specialists' Wisps. Working assistants move gently; recruited or waiting assistants stay still. Reduced-motion settings turn off the animation. Select **View team** to follow the work.

The team page shows each assistant's role and current assignment, the working plan, acceptance criteria, questions, reviews, and handoffs. **Recruited** means an assistant has joined but has no assignment yet. Handoff counts describe received replies, including reviews that request changes; they are not a percentage of the whole project. Open **Assignment details** to read the request and the assistant's response.

Choose **Answer in chat** when the team needs your input. It returns to the same job conversation with the coordinator, including questions from specialists. Opening a question does not answer it; discuss it so the coordinator can record your answer and conditions. You can inspect or open existing results in this chat’s canvas before continuing. Background work, questions, and final delivery keep the same conversation. Older question links return here with their saved messages preserved.

Team tasks also appear in **Tasks → All tasks** and **Recent**. Filter by active or past teams, or show all, and select a team to inspect it. Team notifications open the same page. Finished teams keep their activity and reviewed downloads available. Activity refreshes while the page is open; if updates fail, the page labels the last known state. Team details are private to the account running the work and are not included in shared chats.

### Following a team job

Each team job has one inbox card with its title, coordinator, current state, and latest work. Open the card for the team page, choose **Answer in chat** for a question, or **View results** when the reviewed work is ready. Questions and results from the same job are grouped; separate jobs stay separate even when they share a conversation. Reading a notice does not answer its question. Active jobs and unanswered questions remain visible beyond 48 hours. Routine digest builds stay out of the inbox.

The team page puts questions and completed results before the roster and detailed handoff history. **Talk to the coordinator** opens the job’s existing conversation in the docked panel, beside the work. **Open full chat** uses the same conversation on the chat page. On phones, the conversation opens full-screen so both views remain usable. A job’s current stage reflects the coordinator’s saved update or the current assignments. Use **Stop job** on the team page to stop the job and its delegated work after confirmation; saved files and completed actions are kept.

When one conversation has several jobs, use the selector above the team strip to choose which to follow. **More jobs** loads earlier jobs in that conversation.

If you resolve the last blocker in the job conversation, the coordinator can record your answer and complete the reviewed job there. It does not need another background run. The question leaves the active queue; its history stays on the team page. Opening chat or saying thanks alone does not approve an action.

## Finding assistants in a large directory

Search by name or role, filter by status or access, and sort by name, role, or status. Results appear in pages of 50; use **Previous** and **Next** to browse. The directory switches to list view for large collections. You can always choose cards or list view. The assistant picker in chat also supports search. Your current assistant stays selected even when it is outside the search results.

Team work queues when execution capacity is busy. Each user and workflow can run up to four assistant handoffs at once, with twelve across the service. An assistant waiting for your answer or a teammate releases its slot so other work can continue.

Team history uses **Previous** and **Next** too. Only the page you are viewing refreshes; completed team details stop polling. Open a team to see its current assignments and results.
