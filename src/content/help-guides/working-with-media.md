---
id: "working-with-media"
title: "Working with Media Files"
category: "media"
date: "2026-09-18"
---

## Working with Media Files

The Media section helps you manage files you've uploaded, generated, edited, or reused in chat and applets.

### Uploading Files

- Go to **Media** from the sidebar
- Use **Upload**—the upward-arrow button in the file toolbar, or the labeled button when the library is empty
- Select multiple files in the upload picker to add them in one batch
- Attach videos directly in chat; longer videos may take more time to upload and process
- You can choose any file; unsupported or unsafe files are rejected during upload with an error

### Managing Files

- View your uploaded files in a grid or list layout; Media opens in grid view until you choose another view
- Media opens to the **media** folder and shows files directly in that folder
- Search and filter files by name or type
- File browsers refresh after uploads and periodically while open
- Selecting a folder shows files in that folder; use **All Files** when you want a cross-folder view
- Click a file to preview it
- Select files and use **Move** to enter a folder name or choose an existing folder
- Select files and use **Add Tag** to enter one tag or auto-tag each selected file
- Rename a file from list view by clicking its name, or from grid view by opening the tile menu and choosing **Rename**
- Download or delete files as needed

### Generating Media

- Use the media generator at the top of the Media page to create images, videos, music, speech, or upscaled media from a prompt or required references
- On desktop, drag the thin divider below the generator to resize it between roughly 10% and two-thirds of the Media page
- Start with a creation tile such as **Create Image** or **Create Video**, choose a model, then follow the staged flow for that model
- The flow is grouped into model-driven stages: choose a variant when the model has multiple input paths, attach or skip references as the model allows, enter prompts or model text inputs, review options, then use **Generate** from the final step
- When the selected model or input path makes the prompt optional, the prompt stage says so and the action changes to **Skip** until you type a prompt
- If generation is blocked on the final step, the status card lists the missing prompt, reference, or option instead of only asking you to complete earlier steps
- On the final step, use **Back** to adjust the same setup, **Start over** to clear the draft, or **Generate** to queue the item directly into the media files area
- Returning to the creation tiles or using **Start over** clears the prompt and attached generation references; switching models inside the same flow keeps the current draft
- Use the prompt-assist button to draft a randomized starter prompt when the prompt box is empty, or to refine your current prompt using the selected model, input path, references, and visible settings
- New generations are saved into the folder you are currently viewing, so they appear there as soon as the pending item is created
- Generation prompts are automatically tagged so new items are easier to find later
- Some generations continue in the background; check notifications or refresh the Media page for updates

### Model Settings and Inputs

- For Seedance 2.5, Omni 1.1, and Lyria 3.5, choose **Prompt** to start from text with optional references, or choose a reference variant. Variant summaries list required inputs only; optional references remain available in the references stage.
- Choose a creation tile and model to adjust model-specific controls before you generate
- Image and video models may show aspect ratio, image size, duration, resolution, camera, audio, or prompt-optimization controls
- Music models may show duration, output format, sample rate, bitrate, vocal or instrumental controls, and lyrics options
- Speech models may show voices, modes, formats, and other voice controls depending on the selected model
- Upscaling models may require exactly one image or video reference plus model-specific upscale controls
- Longer text fields, such as lyrics, reference transcript, or voice description, appear in the prompts stage when the selected model needs them
- If a model input only applies in a certain mode, change the mode first; the matching field appears automatically
- The staged flow is built from model metadata, so it updates when you switch models, attach files, pick a branch, or change required controls
- The options stage shows the available model settings in one place so the generator uses the values you set before generation

### New model workflows

- **Gemini Omni 1.1 Flash** accepts up to 10 images and 3 videos (up to 10 seconds each), but no standalone audio references. Choose the aspect ratio and resolution; describe timing in the prompt.
- **Lyria 3.5** creates music from text and up to 10 images. Choose MP3 or WAV. Availability requires the separate Gemini API key; Vertex credentials alone do not enable it.
- **Seedance 2.5** accepts up to 30 image, 10 video, and 10 audio references. Video references must total at most 30 seconds, and audio references must total at most 30 seconds. Audio needs at least one visual reference. Use either start/end frames or general reference media, not both. Current resolutions are 480p and 720p.
- **LTX 2.5 Fast** supports start/end frames. Clips longer than 10 seconds require 720p or 1080p and 24 or 25 FPS.
  The resolution and frame-rate choices update when you change duration; incompatible selections reset to a supported default.
- **Qwen Image 3 Pro** supports one optional reference image, input-image matching, prompt expansion, and a negative prompt.
- **Seedream 5 Pro** supports up to 10 reference images. Enable **Layer Decomposition** with exactly one image to return a base image and separate layers; the prompt is optional in this mode. Standard generation supports 1K/2K; decomposition also supports 1.5K/auto. All returned files are saved.
  Image-size choices update with Layer Decomposition. Turning it off resets 1.5K/auto to 2K. Standard mode requires a prompt; only Layer Decomposition allows you to skip it.
- **Recraft V4 Styles Pro / SVG** requires either 1–10 style reference images or a **Reusable Style ID**, never both. Results retain the reusable style ID in generation metadata. SVG output remains SVG.
- **ElevenLabs Dubbing v2 (Alpha)** takes one audio file, video file, or **Source URL**. Select the target language (including Arabic dialect options) and voice-cloning strength. No prompt is needed; the result is FLAC audio, not a dubbed video. Only use voices and content you are authorized to dub.
- **MiniMax H3** is registered but unavailable until Replicate publishes its API schema. Preview/alpha status and missing provider credentials can affect model availability.
- **Gemini 3.8 Flash** is available for chat and image understanding; it is not an image-generation model.

### Attaching Reference Files

- Select media items from the grid or list, then use **Add** in the references stage to add every compatible selected item to the matching reference box
- Deselecting files in the grid or list does not remove prompt references; use the references stage to remove attached references
- Selected references appear inside the labeled reference boxes in the staged flow, with a short note explaining what each reference is for
- Use each reference box to review selected files, remove a reference, or change its role when the model supports roles
- Optional reference boxes can be skipped; required boxes must be filled before generation is enabled
- Use the references stage to select matching files below and choose **Add**, or drag a file from the grid or list onto the matching reference box
- Unsupported references stay visible with an inline warning so you can remove them or switch models
- If the selected model needs more references, the generator shows **Attach more references** and disables generation until the requirement is met
- If the selected model only accepts one audio reference, attach exactly one audio file before generating

### Image and Video Workflows

- To edit an image, select one image, choose an image model that accepts references, describe the change, and generate
- To combine images, select multiple images, choose a compatible image model, describe the desired result, and generate
- Some video models accept image references with roles such as **Reference**, **Start Frame**, or **End Frame**; use the references stage to choose the role for each selected file
- When a selected video is used as a **Start Frame**, Concierge captures its last frame and sends that frame to the model
- When a selected video is used as an **End Frame**, Concierge captures its first frame and sends that frame to the model
- For video models that support extension, select a video reference, choose **Extend**, describe what should happen next, and generate
- Veo image references must be JPEG or PNG; other image formats show a warning until you remove them or use a compatible file
- Open an image and click or tap the preview to zoom in; click or tap again to return to fit-to-screen

### Music Workflows

- To generate music from text, choose a music model, describe the style, mood, instrumentation, vocals, and structure, then generate
- Add lyrics in the **Lyrics** field when the selected model supports lyrics
- Use instrumental or vocal controls when you want to force an instrumental track or allow vocals
- To use visual context with Lyria, select one image before generating and describe how the image should influence the track
- To create a music cover or transform an existing track, choose a compatible cover model, select one audio item as the input reference, set any available music controls, and generate

### Upscaling Workflows

- To upscale an image, choose an image upscaling model, attach one image reference, confirm the required upscale controls, then generate
- To upscale a video, choose a video upscaling model, attach one video reference, confirm the target resolution or frame-rate controls, then generate
- Upscaling models may not need a text prompt once the required reference is attached; the staged flow shows when the selected inputs are enough

### Speech and Voice Cloning

- For normal speech generation, choose a speech model, enter the words to synthesize in the prompt box, add any delivery direction, and generate
- For voice cloning, choose a cloning-capable speech model such as **QWEN3 TTS**, set the model to clone mode, upload a clean voice clip of the subject speaking, select that audio item as the voice reference, enter the text to speak, then generate
- Use a short, clear reference clip with one speaker and minimal background noise for cloning
- If the model asks for a reference transcript, enter what is spoken in the reference clip in the model input field
- For voice design, switch to the voice-design mode and describe the voice before generating; the generator warns you if the voice description is missing
- Keep only one voice reference selected for cloning models unless the model explicitly allows more

### Reviewing Generated Media

- Open a media item to preview the output, review the prompt and settings, inspect generated outputs, copy the prompt, or copy download links
- Use the play button on an audio or video grid tile to play it in place without opening the preview dialog
- Generated videos may show thumbnails after processing; if a thumbnail is missing, Media refreshes and backfills it when possible
- Audio items can be previewed from the tile or inside the details dialog

If a video preview or an inline audio player cannot load, it shows **Media preview unavailable**. Use **Retry preview** to reload that player. A retry does not regenerate media or restore a deleted file; if it keeps failing, the file may be missing or unsupported by your browser.

### Using Files with AI

- Files uploaded to Media can be referenced in chats and applets
- Upload images for the AI to analyze or describe
- Upload documents for summarization or Q&A

### Tips

- Keep file names descriptive for easier searching
- Large files and generated videos may take time to upload or finish processing
- Files are stored securely in your personal storage space

At the reference step, **Drop or choose** opens a file picker for the required image, video, or audio. You can also drop files from your computer directly onto that reference. Uploaded files are attached up to the model’s reference limit; existing references stay selected. Upload failures appear above the generator so you can retry.

Generated media is saved to your own library. If storage fails after generation, Concierge reports the failure without automatically paying to generate the same item again.

### September model additions

- **GPT Image 2.5 Flare and Sunburst** support generation and editing with up to 10 reference images. Choose quality, output format, and the number of images. Transparent backgrounds require PNG or WebP. Large pixel sizes are experimental. GPT Image 2 remains the default and an Azure fallback while the new models are evaluated.
- **Wan 3.0** generates 2–30 second clips from text or one start frame, at 480p, 720p, or 1080p. It does not edit uploaded videos.
- **P-Video-2-Pro** offers speed and quality modes, 5–15 seconds, and 480p or 768p. Assign start and end frames to control the transition.
- **P-Video-2** adds audio input, 720p/1080p, 24/48 FPS, draft previews, and 1–20 seconds. An attached audio track determines duration; the audio toggle controls whether the resulting video includes audio.
- **FLUX 3 (Preview)** uses attached images in order: first frame, intermediate storyboard frames, last frame. Three or more images require an explicit duration. Attach a video instead to continue it; images and continuation video cannot be combined. Draft previews use 720p.
- **Gemini Omni 1.1 Flash** is the stable replacement for the preview. Use assigned start/end frames for interpolation, or attach one video and choose **extend**. Uploaded videos must be no longer than 10 seconds. Resolution options include upscaled 1080p and 4K.
- **MAI-Image-2.6-Flash (Preview)** appears when its Azure deployment is configured. It supports PNG output, one PNG/JPEG edit reference, automatic aspect ratio, and optional web grounding.

Older Omni, Gemini 2.5 Flash Image, Seedance 1/1.5, and Lyria 3 Pro choices are removed from the normal picker when their replacements are available. Existing files and job records remain accessible. Kling 2.5 and Seedream 4/4.5 remain available.

### Saved media and long video jobs

Transcription renews access to saved applet, chat, and media-library files when a job starts. You must still have access to the applet or chat and its file.

For Seedance, attach a reference video before choosing **Edit** or **Extend**. A prompt or image alone cannot be edited or extended as a video. **Generate** still supports a prompt without a video.

Long video jobs remain active while the provider reports progress. A connection interruption can recover the completed result without starting another generation. A stalled provider or the overall time limit can still end a job with an error.

### Slow or declined video generation

Some video requests, including Seedance, take more than ten minutes. Concierge allows video jobs up to 30 minutes without a progress update, with a 40-minute overall limit. You can leave the Media page and return later.

A Seedance content-filter refusal is different from a timeout. Its filter may reject ordinary scenes as well as restricted content, and it may flag either the references or the generated output. The failure message explains this. Review the prompt and reference files or choose another video model; unchanged requests are not retried automatically. Technical details remain available on the failed item.

When asking the assistant to inspect images, provide the exact file path. Images created in other workspace folders must first be copied into the current chat's `/workspace/files/chats/<chatId>/` folder. An incorrect path no longer selects another image with the same filename.

### Asking an assistant to generate media

Ask for images, video, music, speech, editing, dubbing, or upscaling in chat or as part of a task. You can name a model, give settings such as duration or resolution, and point to reference files. For example: “Use Seedance 2.5 to make a five-second video from this image, with audio, and save it in media/launch.”

Assistants discover the available models and fetch settings for the selected model when needed. Generation runs as an ordinary background job and appears in **Media**, with progress in Tasks. The assistant receives a task receipt and can check it for the saved outputs, then use those files in another generation. A pending receipt means the job is still running. Repeating a status check does not start another generation.

In chat, each generation also gets a live result card in the assistant’s reply. It updates automatically when the job finishes, including after you reopen the conversation. Comparisons keep each model’s results together. Open **Generation details** to inspect the completed tool steps. You can keep chatting while media is being created; the assistant can use the same task receipt to retrieve the result for a follow-up.
