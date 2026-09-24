---
id: "creating-using-applets"
title: "Creating and Using Applets"
category: "applets"
date: "2026-08-17"
---

## Creating and Using Applets

Applets are custom AI-powered mini-applications that you can create, test, publish, share, and reuse.

### What Are Applets?

Applets are interactive workflows with their own UI, files, instructions, and optional access to connected services. Think of them as specialized tools built on top of Concierge's AI capabilities.

### Using Existing Applets

1. Go to **Applet Library**. It opens on **Discover** by default; switch to **My Applets** or **Shared With Me** for applets you own or that were shared with you
2. Browse available applets or open one shared with you
3. Click an applet to open it
4. Fill in the required inputs and run it

Applets can be opened from the Applet Library, Home, direct `/apps/slug` links, shared links, or other applets without adding them to your sidebar. Use **Edit sidebar** → **Add** only when you want a persistent sidebar shortcut for one or more of your applets. Sidebar launches use the published version first; if the applet is not published, Concierge opens the latest saved version; if no saved version exists yet, it opens the current Draft.

Use **Edit metadata** on a canvas applet card or from **More actions** in the canvas applet toolbar to set the name, slug, description, icon, image, badge label, category, and tags used in applet cards, the app catalog, and private sidebar installs. New applets automatically start metadata and card-image generation after the Draft is created. Card-image generation creates compact card background artwork, stores the files with `card-art-dark` and `card-art-light` filename stems, applies the dark image as the default first, then generates the light image from the dark image as a reference and saves it when ready. Applet cards choose the version that matches the current theme. The metadata editor is centered on an editable card preview with a light/dark preview toggle that starts in the current app theme. **Generate Metadata** refreshes the text, icon, badge, category, and tags without overwriting image URLs; **Generate Images** replaces the existing generated files in the applet asset folder and refreshes the dark and light image URLs without publishing the applet. When Concierge generates applet images for you, it can add optional style cues for palette, lighting, medium, mood, and composition without replacing the applet metadata prompt.

If an applet card image is missing or cannot load, the card shows the default background and applet icon. You can still open and use the applet.

If a generated applet cover link expires, Concierge automatically renews access to the existing image when you view the card, including covers created by someone who shared the applet with you. You do not need to generate a new image. The applet must still be available to you and the image file must still exist.

### Creating Your Own Applets

1. From **Applet Library → My Applets**, click **Create Applet** and describe what you want to build, or start from an open chat canvas
2. Concierge opens a saved chat with the canvas already showing the generating applet preview
3. Review the live canvas preview as Concierge creates the applet and starts metadata/image generation in the background
4. Use **Full page** and **Home widget** to edit the two layouts separately. The widget is a compact version sized for an Interactive Home tile; if it does not exist yet, Concierge generates it when you open **Home widget**. Use **Regenerate widget** (under **More actions** on the chat canvas, or the footer in the Home modify editor) to rebuild a preview from the full page, then **Save widget** to put it on Home. Changes Concierge makes to the full-page Draft do not update the Home tile until the widget HTML is saved (**Save widget** or Concierge's widget update).
5. For revisions to an existing applet, Concierge edits the applet's Draft workspace HTML file instead of generating a separate applet
6. Use the **Code** tab for direct HTML changes when needed
7. Test the applet in the preview and ask Concierge for revisions
8. **Publish** only when you want other users to see the current version

Large applets preview with the same page-style scrolling used by published applets, so layout that depends on scrolling, overlays, or fixed positioning can be tested before publishing.

### Setting an Applet as Home

Use **Edit** on **Home** to add applet cards to your Home layout. You can also ask Concierge to set the current applet as Home after it builds or updates one. Interactive Home tiles use a dedicated **widget** layout that is glanceable like a system widget, not a scaled-down web page; if an applet does not have one yet, Concierge generates it automatically. Open **full screen** from the control at the top of the widget to use the full applet. Home's full-page applet mode still renders the applet's editable Draft rather than the published version.

### File-Backed Drafts

When an existing HTML workspace file is registered as an applet, Concierge links the canvas tab to that applet and writes the applet identity back into the workspace file. Reopening that HTML file from the canvas keeps the applet link. Edits update the mutable Draft; saved versions are created only when you or Concierge explicitly save the applet.

When you ask Concierge to open an HTML file in the canvas, it can use the workspace path, blob path, file URL, or file hash from Media results. Existing applet HTML opens as the linked applet, applet files without metadata are registered first, and generic HTML opens as an immersive preview with canvas controls hidden by default. Non-HTML files should be opened from Media instead of the applet canvas.

Avoid embedding very large inline datasets directly inside the applet HTML. Concierge may store large applet versions outside the main database record, but the live preview still loads the rendered HTML in the browser iframe. Keep large data in applet files or remote endpoints when possible.

### Using AI in Applets

Applets can use the Concierge Applet SDK to call AI from their own HTML. Use `ConciergeSDK.agent.chat()` when the applet needs the current user's personal agent, tools, or connected services. Long agent calls use a streaming transport internally so normal multi-step research is not cut off by a fixed gateway wait, while the returned promise still resolves to one complete response. Use `ConciergeSDK.models.executePrompt()` for direct stateless model calls such as translation, classification, extraction, rewriting, scoring, or JSON generation. `ConciergeSDK.models.generate()` still works as a backward-compatible alias for older applets.

Direct model calls can choose an applet-available model and reasoning effort. Use `ConciergeSDK.models.list()` to load the allowed model IDs, display names, defaults, and supported reasoning effort values before building a model picker. `executePrompt()` returns `result` plus optional `citations` and `metadata`, so applets can render model output with source citations and extra tool details when the response includes them.

When an applet needs reusable private context, ask Concierge to attach an agent context. It is a shared cloud folder whose files and optional instructions are available to the applet's agent. The folder can use any structure appropriate to the use case, authorized applets can share it, and `ConciergeSDK.agent.chat()` uses the applet's saved binding automatically.

Use the SDK reference to choose a model API, your personal agent, or a data/search API. Applet generation and HTML import reject references to restricted internal services. If a needed data API is unavailable, Concierge should explain the gap.

Applets can also create media through the SDK. Use `ConciergeSDK.media.models()` to load available image, video, music, and speech models plus each model's valid Media-page controls and options, then start work with `ConciergeSDK.media.create()`, `createImage()`, `createVideo()`, `createMusic()`, or `createSpeech()`. These methods use the same background Media pipeline and model settings as the Media page. Track completion with `ConciergeSDK.tasks.wait(taskId)` or `ConciergeSDK.tasks.get(taskId)`, then use the returned media URLs, hashes, or blob paths as references for follow-up `media.modify()` or `media.combine()` calls. Home widgets can use `createImage()` for a full-bleed atmospheric background (for example weather), then cache the URL in `ConciergeSDK.data` so it does not regenerate on every load.

Use `ConciergeSDK.navigation.open("/apps/slug")` when an applet needs to move the full Concierge page to another internal route, such as another published applet. The path must start with `/`; external URLs are rejected. Pass `{ replace: true }` when the handoff should replace the current browser history entry.

Concierge protects the app from runaway applet code. The SDK automatically backs off and retries limited AI and read calls, but service-token, write, upload, and delete calls surface the error without retrying. Avoid calling SDK AI, service-token, data, or file APIs from tight render loops, recursive prefetch chains, or unbounded timers. Do not implement an SDK timeout with `Promise.race()` alone: it rejects only the wrapper and leaves the request running, so a retry can overlap it and hit the concurrency limit. To make a request cancellable, create an `AbortController`, pass `signal` to `agent.chat()` or `models.executePrompt()`, and call `controller.abort()` when the UI times out or is replaced. Abandoned in-flight SDK requests also expire after a few minutes. Repeated limit violations can temporarily suspend SDK access for that applet for about 15 minutes; after fixing the applet code, clear the suspension with the applet metadata tools or wait for it to expire.

### Storing Applet Data

Choose storage by who should see the data and how large it is.

| Need                                                                                                                                                                  | Use                                              |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Small private JSON for the current user only, such as preferences, filters, draft inputs, progress, or selected IDs                                                   | `ConciergeSDK.data`                              |
| Small shared JSON every user of the applet should see, such as collaborative workspace state or shared settings                                                       | `ConciergeSDK.sharedData`                        |
| Shared durable files that belong to the applet itself, such as bundled source data, templates, fixtures, or exported reports everyone should see                      | Applet files in the applet workspace/file system |
| Private durable files for the current user, such as uploaded transcripts, extracted VTT/SRT segments, search indexes, user-specific exports, or large generated state | `ConciergeSDK.files` applet-user files           |

`ConciergeSDK.data` stores each current-user key independently; use `data.get("key")` to load one key or `data.get()` to load the merged object for compatibility. Keep each value under the 2MB storage limit, including encoding overhead. Large arrays may exceed the storage limit even when their JSON is smaller. A rejected oversized save leaves the previous value intact; store large data with `ConciergeSDK.files`. Autosaves to the same key in one applet instance run in order, including retries. Show save errors and retain unsaved edits for retry; closing the applet can discard queued edits.

`ConciergeSDK.sharedData` is shared by all users of the applet. It uses revision protection, keeps recovery snapshots before replacing state, and rejects attempts to clear non-empty state through `set()`. Use `sharedData.reset(key, value)` only for a user-confirmed clear or reset action.

Large data does not belong in `data` or `sharedData`. Store shared large assets as applet files. Store current-user large assets with `ConciergeSDK.files`. IndexedDB can be used as a browser cache, but it should not be the only durable copy if the data matters across devices.

Static files bundled beside a Draft applet can use relative paths from the applet HTML file's folder. For example, an applet at `/workspace/files/applets/text-ai-launcher.html` can load `assets/text-ai-launcher/banner.jpg`, which resolves to `/workspace/files/applets/assets/text-ai-launcher/banner.jpg` in preview and Home.

### Legacy Workspaces

Legacy workspace applets still work through their old published links and app-store entries. When you open or edit one from Concierge, it is upgraded to the current canvas applet format first, then opens as a normal applet Draft. After that, applet edits happen from the canvas applet experience instead of the workspace Applet tab.

During this upgrade, Concierge keeps a migration spinner on screen until the applet opens in chat. The applet keeps its published applet name when that name differs from the old workspace name.

**Applet Library → My Applets** stays focused on current canvas applets. Use **Applet Library → Workspaces** to open legacy workspace applets and regular workspaces, or to create a new workspace.

Workspaces remain available for prompt collections and files. Applets migrated from workspaces can still run the workspace prompts they were built with through the applet SDK.

### Sharing Applets

- Use **Share** from **Applet Library → My Applets** or **More actions** in the canvas applet toolbar while editing to invite other Concierge users as viewers or editors on the draft
- Manage everything you have shared from **Settings → Sharing**
- When you **Publish**, choose **Anyone with the link** to make the live applet public via its URL without listing it in the Applet Store
- Choose **Specific people** to share the live published applet with selected Concierge users; they receive a notification and can open the published version
- Choose **Applet Store** when you want the applet listed publicly for everyone on the platform in **Applet Library → Discover**
- Republishing a new version with **Anyone with the link** or **Specific people** updates the live version and does not remove an existing Applet Store listing or `/apps/slug` route; unlist from the store separately when you manage the published applet
- Other users can use published applets without editing your draft
- Add `?embed=true` to a published applet link when you want the URL to render only the applet, without the Concierge sidebar, top bar, docked chat, footer, or published applet action buttons
- Your draft and the published version are separate until you publish again
- Installing an applet in your sidebar is private to your account and does not publish it to the Applet Store

### Working with Versions

- Saved applet versions are numbered starting at 1
- The canvas version browser lets you review earlier versions and jump to the published version; if the preview is showing Draft content that is not a saved checkpoint yet, it is labeled **Draft**
- Saved versions open read-only in the Code tab. To change one, click **Edit this version** to copy it into Draft, then edit and save a new version
- Continuing from an older version copies that immutable version into Draft; the older version and published versions are preserved
- In chat, Concierge can copy a saved version directly into the applet's Draft workspace file with `CopyAppletVersionToDraft`; the canvas switches to Draft right away and refreshes from the Draft workspace file while Concierge continues editing
- If an accidental checkpoint is saved, Concierge can delete that single saved version with `DeleteAppletVersion` without deleting the Draft or applet; deleting a saved version or clearing Draft from the canvas always asks for confirmation first
- Editing Draft does not change the public applet until you publish a saved version

Subtitle files in SRT or VTT format can be uploaded even when your browser does not identify their file type.

If a newly generated applet cannot be saved, the error includes its existing applet ID or uploaded file path when available. Ask Concierge to recover that saved file instead of generating the applet again. Keep the canvas open if the upload itself failed.
