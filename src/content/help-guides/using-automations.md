---
id: "using-automations"
title: "Assigning tasks"
category: "automations"
date: "2026-09-14"
---

## Assigning tasks

Give an assistant a task to do once, on a schedule, or when files change. Each task keeps its instructions, supporting files, and history together.

### Catch up on recent work

A dot on **Tasks** means there are unread task results or assistant messages. Open it to see **Recent**. Without a dot, Tasks opens **Assistants**; you can choose **Recent** or **All tasks** whenever you need them. Animated wisps accompany a list of the latest finished work, grouped by Today, Yesterday, and Earlier. Each row shows the assistant, task name, completion time, and a **New** label when you haven't read the result. The list shows the latest completion of each task; older runs remain in that task's history. Use the assistant filter to see one assistant’s work.

Select a row to open its report on a separate view. Read the written update or rich page, share it, start another run, or edit the task. **Recent runs** opens the history when you need it. **Back to recent work** returns to the list, on desktop and mobile.

**Mark as read** clears only that task's current result. Other results stay new, and a later completion appears as new again. Read indicators are saved in this browser. New assistant messages and requests for help appear above recent work; open a message to follow its link or continue the conversation.

### Assign a task

1. Choose **Assign a task** in Tasks.
2. Pick **Assistant** and describe what you need. Include a time such as “every weekday at 8am” if you want it repeated.
3. Use **Suggest with AI** to draft the details, or choose them yourself.
4. Choose a written update or a **Rich page**, and set a schedule if needed.
5. Choose **Create** to save the task, or **Create & customize** to open its settings.

You can also open an assistant from **Assistants**, then choose **Assign a task**. The assistant is already selected. Tasks created in an assistant's chat stay assigned to that assistant. Existing unassigned tasks use your personal assistant.

### Find or change a task

**All tasks** lists all tasks, including those that haven't run yet. Filter by assistant and select a task to open it. Choose **Edit** to change its instructions, schedule, assistant, supporting files, or Home widget. **Back to results** finishes editing. Existing `/automations` links continue to work.

**Assistants** is a directory of your assistants. Choose an assistant to chat, assign them a task, or open their existing tasks. Options and memory are available inside their profile. **Back to assistants** returns to the directory.

### Set a schedule

Use **Hourly** for interval-based runs, or **Run on clock time** with minute `0` for the top of each matching hour. **Daily** supports one or more times, such as `06:00` and `18:00`. **Weekly** supports selected weekdays at the same set of times. A task can also watch a workspace folder for changes.

Before the first run, the task has no report yet. Choose **Run now** to start it, or let its schedule start it. The report appears when the work is ready.

### Files and connected services

Add supporting files for reusable inputs, examples, or reference material. Tasks support the same attachment types as chat. A run includes the task instructions and supporting files, plus the latest successful rich-page output when available.

Assistants can use connected services such as Jira, Confluence, Slack, and GitHub. Connect the service from MCP settings first, then mention it in the task instructions. Credentials refresh in the background where supported; if reconnection is needed, reconnect the service and run the task again.

### Reports on Home

Use **Produce HTML output** in the editor for rich reports such as a daily digest. **Open full page** opens the full report. Enable **Show as a widget on the home screen** to see a compact version on Home. Open the widget full screen to read the full report.

Enable **Show as a widget on the home screen** when you want the latest run to appear on Home. Large Home tiles use the widget version; open **full screen** to read the full report. Older runs without a widget version show the full HTML until the automation runs again.

### Waiting and interrupted runs

Automations and Home digest refreshes share a background queue. They may wait when other work is running; each user runs one of these jobs at a time. Your configured schedule and timezone stay the same.

A run has up to 20 minutes once execution starts. If it is interrupted, review its history and any files it created before using **Run now** again. Concierge does not automatically repeat an interrupted agent because it may already have changed files or used a connected service.

New rich reports and Home widgets cite their sources with ordinary links that also work when the HTML is opened separately. Written summaries keep the same citation controls as chat. A report with unresolved citation markers is stopped before its HTML files replace the latest successful output. Existing reports are not regenerated or rewritten.

### If a task fails

A failed run shows a short message, with **Technical details** you can expand when troubleshooting. Your task stays saved, and **Run now** starts another attempt. If an earlier report is available, it stays visible and is labelled as the last completed report. Failed attempts remain in **Recent runs**.

## Work across assistants

Ask an assistant to involve other assistants by role: “Have the researcher check the facts and the editor review the style in parallel. Combine their feedback, ask me to approve the draft, then prepare the final document.” The assistant can discover available assistants and send each a request. Independent requests run in parallel; later stages begin after their required replies. Each assistant keeps its own identity, instructions, memory, and tools.

Documents stay in your workspace. Each handoff carries the current stage, a short progress note, and the file paths the next assistant needs. Parallel editors should save separate versions so they do not overwrite each other.

If your input is needed, a notification opens a dedicated chat with the assistant that asked. Discuss the question normally. When the answer is clear, the assistant records your decision and the task resumes with that answer and your conditions. Rejection is passed back too; silence is never approval. A task marked **Waiting for replies** is paused between turns and can remain that way while you are away. Other independent work may continue. You do not need to rerun the task.

## Output retention

Tasks keep the outputs of their latest 30 successful runs by default. The owner can change this in **Edit → Advanced → Output retention**, or choose **Keep all outputs**. Hourly cleanup removes older generated report files and full results, while keeping each run’s date and status in history. Expired reports display **Output expired**.

The current report, instructions, uploaded materials, and outputs saved separately are preserved. Cleanup waits while a task is running or waiting for an answer. Copy a report outside the task’s output folder if you want to keep it permanently. Increasing retention does not restore outputs already removed.
