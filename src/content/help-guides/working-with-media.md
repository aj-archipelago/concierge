---
id: "working-with-media"
title: "Working with Files and Media"
category: "media"
date: "2026-05-27"
---

## Working with Files and Media

Concierge keeps uploaded and generated files in scoped storage so chat, workspace, and applet flows can find the right file without exposing unrelated user content.

### Browsing Files

- Open **Media** or a file picker from chat, workspaces, or applets
- Use grid or list views depending on how much metadata you need to inspect
- Search by filename when a folder contains many files
- Open a file to preview it before attaching it to a workflow

### Uploading Files

- Drag and drop files or use the upload button
- Keep file names descriptive so they are easy to find later
- Large files may take longer to upload or process
- Unsupported or unsafe files are rejected during upload with an error

### Generating and Previewing Media

- The Media page can show generated images, videos, and audio files when your connected Cortex instance supports those generation models
- Use the play control on audio and video tiles to preview results without leaving the grid
- Open an audio item to continue playback in the details dialog, then close it to return playback to the tile
- Concierge uses its managed file proxy for previews so expired direct storage links do not break supported media playback

### Scoped File Access

- Chat files are available to the current conversation
- Workspace files are available inside that workspace
- Applet files are scoped to the applet and current user unless the applet uses shared data or published assets
- The file manager routes requests through Concierge so applets and previews can fetch files without browser CORS issues

### Tips

- Attach only the files needed for the current prompt
- Remove stale references before changing models or workflows
- Use folders and descriptive names for long-running projects
