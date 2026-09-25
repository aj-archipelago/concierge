---
id: "using-chat"
title: "Using the Chat"
category: "chat"
date: "2026-06-26"
---

## Using the Chat

The Chat is your primary way to interact with Concierge's AI assistant. You can ask questions, generate content, analyze documents, and more.

### Starting a Conversation

1. Click **Chat** in the sidebar to open the full chat view
2. Click **New Chat** to open a saved chat named **New Chat** at the top of your recent chats
3. Type your message in the input box at the bottom
4. Press **Enter** or click the send button

### Chat controls

The app header shows your assistant's animated portrait and name when a chat is open. Click the name to switch assistants. **Files**, the tool count, **Share**, and **More actions** sit beside the assistant. Click the tool count to inspect available tools and connector status.

**What's New**, notifications, and your account stay at the other end of the same header throughout the app. The Concierge logo and wordmark stay at the top of the sidebar; click them for app information and a link to Home. On smaller screens, use the header's menu button to open the sidebar. Chat actions wrap within the header to keep all controls accessible. The layout mirrors in Arabic.

Use the chevron beside **Chats** in the sidebar to collapse or expand recent conversations. Collapsing the list leaves more room for apps; the **Chats** link still opens full history. App shortcuts support keyboard navigation with Tab and Enter, and the mobile drawer scrolls when needed to keep navigation and Help reachable.

### Uploading Files

Each upload is saved in the selected chat or folder. Identical content in another location stays a separate file. Original filenames remain visible, including when a document is converted for analysis.

You can share files with the assistant for analysis:

- Click the **attachment icon** in the chat input
- Select files from your device or drag and drop them
- You can attach multiple files to one message. Send becomes available when all uploads finish. Removing one attachment keeps other files with the same name.
- Open **Files** at the top of a chat, select existing chat files, and choose **Attach** to add them to your next message
- Supported formats include images, PDFs, documents, audio, and video

In **Files**, open the destination folder before choosing **Upload**. Uploads follow that folder, including when you switch to another chat or Global Files. From **All Files**, uploads use the current chat, or Global Files when opened from the sidebar.

### Downloading Generated Files

Images shared in a reply update as the reply finishes arriving. You can reopen the saved chat to view them later without generating them again.

Click a file link in the conversation to download a saved artifact. Concierge refreshes expired storage links when you click, so you can return to an older chat without asking for a new link. You must be signed in and still have access to the file. HTML artifacts download as files; use Canvas to preview them. A copied raw storage URL can still expire, so reopen the link from the chat or **Files**.

### Chat History

- All your conversations are saved automatically
- Open previous chats from **Chat history**, or use the **Chats** section in the sidebar for your recent chats
- The sidebar shows a few recent chats; use **View all** or the **Chats** header to open full chat history
- Sidebar chats show a status dot: static gray when idle/read, a pulsating gray while a reply or background task is running, blue when work finished while you were away (unread), red if a task failed, and yellow when the chat needs your attention (for example a confirmation or a tool that requires you to switch back). Opening the chat clears blue/red/yellow back to idle gray. These dots also appear in the collapsed sidebar
- Hover a chat in the sidebar to **Pin** or **Archive** it, or right-click for **Pin**, **Rename**, **Copy link**, **Share**, **Archive**, and **Delete**
- Pinned chats stay at the top of the sidebar list; archived chats are hidden from it
- Each chat history item shows a preview of the conversation topic
- Use the list/grid toggle in **Chat history** to switch between compact rows and card-style browsing
- Use **Show Shared Chats Only** beside the search field to filter shared conversations; press it again to show all chats
- Open **Files** from the sidebar when you want to browse or manage saved files outside the current conversation
- Open **Files** at the top of a chat to start in that chat's file folder while still being able to browse other chat files or **All Files**
- The sidebar **Files** page returns to your last selected folder and scroll position

### Large Conversations

Concierge keeps the full saved history as a conversation grows. If one individual message is too large for storage, only that message is shortened and includes a visible truncation notice; the rest of the conversation is preserved.

Files saved to the chat remain available from **Files**.

### Sharing a Chat

- Use **Share** in the chat header to invite people or create a view-only link
- Choose **Viewer** for read-only access or **Editor** when you want another user to collaborate in the chat
- Recipients can use **Copy and continue** to duplicate the conversation into their own chat and keep going there
- Copied chats do not include access to files from the original shared chat

### Background Responses and Canvas

- If a response is interrupted, Concierge saves the reply received so far and marks it as incomplete. You can ask the assistant to continue.
- If a reply cannot be saved, a warning asks you to copy it before leaving the page. The visible copy is not a saved chat message.
- Long-running responses can keep streaming if you leave the chat and return later
- Each chat keeps its own canvas tabs, active applet, generated HTML, and canvas visibility
- Tools that navigate the app or control the currently mounted applet require that chat to be open and focused
- Tools that do not need the active page can run without waiting for the chat text to finish rendering.

### Tool Status

- Tool rows show progress while Concierge works and a checkmark when a tool succeeds
- Failed tool rows show a red X by default without showing the full technical error
- Click a failed row's red X when you need the complete tool errors for debugging

### Docked Chat

You can use a **docked chat panel** alongside other pages:

- Click the **chat bubble icon** in the header bar
- The chat panel appears on the right side of the screen
- This lets you chat while working in Translate, Transcribe, or other features

When you delete several files, completed deletions remain removed. Files that could not be deleted stay visible so you can retry. Chat attachments are marked deleted only after storage confirms deletion.

Use `/tasks` (or `/مهام` in Arabic) to open your assistants’ tasks. `/edit` opens the task list so you can choose a task to change. Older `/automations` commands still work.

## Follow a team's work

When an assistant starts a team in your private conversation, a team strip appears below the chat header. Your coordinator is surrounded by the specialists' Wisps. Working assistants move gently; recruited or waiting assistants stay still. Reduced-motion settings turn off the animation. Select **View team** to follow the work.

The team page shows each assistant's role and current assignment, the working plan, acceptance criteria, questions, reviews, and handoffs. **Recruited** means an assistant has joined but has no assignment yet. Handoff counts describe received replies, including reviews that request changes; they are not a percentage of the whole project. Open **Assignment details** to read the request and the assistant's response.

Choose **Answer in chat** when the team needs your input. It returns to the same job conversation with the coordinator, including questions from specialists. Opening a question does not answer it; discuss it so the coordinator can record your answer and conditions. You can inspect or open existing results in this chat’s canvas before continuing. Background work, questions, and final delivery keep the same conversation. Older question links return here with their saved messages preserved.

Team tasks also appear in **Tasks → All tasks** and **Recent**. Filter by active or past teams, or show all, and select a team to inspect it. Team notifications open the same page. Finished teams keep their activity and reviewed downloads available. Activity refreshes while the page is open; if updates fail, the page labels the last known state. Team details are private to the account running the work and are not included in shared chats.

If a job starts in the background without a chat, Concierge creates one private conversation for that job when you first open its team page or it sends a question, notification, or final result. The team’s chat link, subsequent questions, and results reuse it. The job keeps its original background source. If its conversation is later deleted or shared, private delivery stops rather than choosing a different chat.

### Following a team job

Each team job has one inbox card with its title, coordinator, current state, and latest work. Open the card for the team page, choose **Answer in chat** for a question, or **View results** when the reviewed work is ready. Questions and results from the same job are grouped; separate jobs stay separate even when they share a conversation. Reading a notice does not answer its question. Active jobs and unanswered questions remain visible beyond 48 hours. Routine digest builds stay out of the inbox.

The team page puts questions and completed results before the roster and detailed handoff history. **Talk to the coordinator** opens the job’s existing conversation in the docked panel, beside the work. **Open full chat** uses the same conversation on the chat page. On phones, the conversation opens full-screen so both views remain usable. A job’s current stage reflects the coordinator’s saved update or the current assignments. Use **Stop job** on the team page to stop the job and its delegated work after confirmation; saved files and completed actions are kept.

When one conversation has several jobs, use the selector above the team strip to choose which to follow. **More jobs** loads earlier jobs in that conversation.

When a background assistant finishes, its result appears in the same job conversation. If that result is visible in your focused chat, its notification is marked read automatically. A hidden tab, closed panel, or result you have not scrolled to stays unread. An ongoing reply finishes before new background messages are loaded. Questions still need your answer; seeing one does not resolve it.

When your answer or a successful action resolves the final blocker, the coordinator can mark the question answered and finish the reviewed job in this chat. This remains available in long conversations; you do not need to start a new chat. Opening a file resolves a request to display it, but does not grant unrelated approval.

Canvas previews reopen their saved files when you refresh or return to a chat. If a file cannot be loaded, choose **Retry** to fetch it again or **Choose a file** to reopen it from the canvas file browser. Switching files cancels the previous load so an older preview cannot replace your selection.
