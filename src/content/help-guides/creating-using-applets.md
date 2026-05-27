---
id: "creating-using-applets"
title: "Creating and Using Applets"
category: "applets"
date: "2026-05-27"
---

## Creating and Using Applets

Applets are small interactive tools that run inside Concierge. They can provide their own HTML interface, use scoped files, store private or shared state, and call approved AI models through the Concierge Applet SDK.

### Finding Applets

1. Open **Applets**
2. Search by applet name when the list is long
3. Select a canvas applet to open it in a new chat-backed canvas session
4. Select a workspace-backed applet to open its workspace

### Creating an Applet

1. From **Applets**, choose **Create Applet**
2. Describe the applet you want Concierge to generate
3. Concierge creates a saved chat for the applet session
4. Review the generated HTML and continue iterating in chat

Use **Create Workspace** on the Applets page when you need the older workspace-backed applet builder.

### Applet Files

Applets use scoped storage so each applet can read and write its own files without browsing unrelated user files. Existing workspace applet files continue to work through legacy workspace routes while new canvas applets use the applet storage routes.

### Concierge Applet SDK

The Applet SDK is exposed as `window.ConciergeSDK` inside applet HTML.

- Use `ConciergeSDK.agent.chat()` when the applet needs the current user's assistant context or tools
- Use `ConciergeSDK.models.generate()` for direct model calls such as classification, extraction, rewriting, scoring, or JSON generation
- Use `ConciergeSDK.files` to list, upload, fetch, or delete applet-scoped files
- Use `ConciergeSDK.data` for private per-user applet settings or progress
- Use `ConciergeSDK.sharedData` for shared applet state that multiple users of the same applet should see

Avoid calling SDK AI, data, or file APIs from tight render loops, recursive prefetch chains, or unbounded timers.

### Publishing

Published applet endpoints are available for public applet views. Keep drafts and published applets separate: update the draft while iterating, then publish only the version other users should see.
