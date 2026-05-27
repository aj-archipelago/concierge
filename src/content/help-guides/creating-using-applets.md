---
id: "creating-using-applets"
title: "Creating and Using Applets"
category: "applets"
date: "2026-05-24"
---

## Creating and Using Applets

Applets are custom AI-powered mini-applications that you can create, test, publish, share, and reuse.

### What Are Applets?

Applets are interactive workflows with their own UI, files, instructions, and optional access to connected services. Think of them as specialized tools built on top of Concierge's AI capabilities.

### Using Existing Applets

1. Go to **Apps** or **Applets** from the sidebar
2. Browse available applets or open one shared with you
3. Click an applet to open it
4. Fill in the required inputs and run it

### Creating Your Own Applets

1. From **Applets**, click **Create Applet** and describe what you want to build, or start from an open chat canvas
2. Concierge opens a saved chat with the canvas already showing the generating applet preview
3. Review the live canvas preview as Concierge creates the applet
4. For revisions to an existing applet, Concierge edits the applet's Draft workspace HTML file instead of generating a separate applet
5. Use the **Code** tab for direct HTML changes when needed
6. Test the applet in the preview and ask Concierge for revisions
7. **Publish** only when you want other users to see the current version

Large applets preview with the same page-style scrolling used by published applets, so layout that depends on scrolling, overlays, or fixed positioning can be tested before publishing.

### File-Backed Drafts

When an existing HTML workspace file is registered as an applet, Concierge links the canvas tab to that applet and writes the applet identity back into the workspace file. Reopening that HTML file from the canvas keeps the applet link. Edits update the mutable Draft; saved versions are created only when you or Concierge explicitly save the applet.

When you ask Concierge to open an HTML file in the canvas, it can use the workspace path, blob path, file URL, or file hash from Media results. Existing applet HTML opens as the linked applet, applet files without metadata are registered first, and generic HTML opens as an immersive preview with canvas controls hidden by default. Non-HTML files should be opened from Media instead of the applet canvas.

Avoid embedding very large inline datasets directly inside the applet HTML. Concierge may store large applet versions outside the main database record, but the live preview still loads the rendered HTML in the browser iframe. Keep large data in applet files or remote endpoints when possible.

### Using AI in Applets

Applets can use the Concierge Applet SDK to call AI from their own HTML. Use `ConciergeSDK.agent.chat()` when the applet needs the current user's personal agent, tools, or connected services. Use `ConciergeSDK.models.generate()` for direct stateless model calls such as translation, classification, extraction, rewriting, scoring, or JSON generation.

Direct model calls can choose an applet-available model and reasoning effort. Use `ConciergeSDK.models.list()` to load the allowed model IDs, display names, defaults, and supported reasoning effort values before building a model picker.

Concierge protects the app from runaway applet code. The SDK automatically backs off and retries limited AI and read calls, but service-token, write, upload, and delete calls surface the error without retrying. Avoid calling SDK AI, service-token, data, or file APIs from tight render loops, recursive prefetch chains, or unbounded timers. Repeated limit violations can temporarily suspend SDK access for that applet for about 15 minutes; after fixing the applet code, clear the suspension with the applet metadata tools or wait for it to expire.

### Storing Applet Data

Use `ConciergeSDK.data` for private settings or progress that belongs only to the current user. Use `ConciergeSDK.sharedData` for applet workspace state that multiple users should see. Shared data uses revision protection, keeps recovery snapshots before replacing existing state, and rejects attempts to clear non-empty state through `set()`. Use `sharedData.reset(key, value)` only for a user-confirmed clear or reset action.

### Legacy Workspaces

Use **Create Workspace** on the **Applets** page when you need the older workspace-based applet builder. Workspaces are still supported for existing applet flows and prompt collections.

### Sharing Applets

- Published applets can be shared via a link or listed in the app store when enabled
- Other users can use published applets without editing your draft
- Your draft and the published version are separate until you publish again

### Working with Versions

- Saved applet versions are numbered starting at 1
- The canvas version browser lets you review earlier versions and jump to the published version; if the preview is showing Draft content that is not a saved checkpoint yet, it is labeled **Draft**
- Saved versions open read-only in the Code tab. To change one, click **Edit this version** to copy it into Draft, then edit and save a new version
- Continuing from an older version copies that immutable version into Draft; the older version and published versions are preserved
- In chat, Concierge can copy a saved version directly into the applet's Draft workspace file with `CopyAppletVersionToDraft`; the canvas switches to Draft right away and refreshes from the Draft workspace file while Concierge continues editing
- If an accidental checkpoint is saved, Concierge can delete that single saved version with `DeleteAppletVersion` without deleting the Draft or applet; deleting a saved version or clearing Draft from the canvas always asks for confirmation first
- Editing Draft does not change the public applet until you publish a saved version
