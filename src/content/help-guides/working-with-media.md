---
id: "working-with-media"
title: "Working with Media Files"
category: "media"
date: "2026-05-25"
---

## Working with Media Files

The Media section helps you manage files you've uploaded, generated, edited, or reused in chat and applets.

### Uploading Files

- Go to **Media** from the sidebar
- Drag and drop files or click to upload
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

- Use the media generator at the top of the Media page to create images, videos, music, or speech from a prompt
- Choose the active model from the model picker, or open **Generation Settings** to switch between image, video, music, and speech models
- Use the prompt-assist button to draft a starter prompt when the prompt box is empty, or to refine your current prompt for the selected model and selected references
- New generations are saved into the folder you are currently viewing, so they appear there as soon as the pending item is created
- Generation prompts are automatically tagged so new items are easier to find later
- Some generations continue in the background; check notifications or refresh the Media page for updates

### Model Settings and Inputs

- Open **Generation Settings** to adjust model-specific controls before you generate
- Image and video models may show aspect ratio, image size, duration, resolution, camera, audio, or prompt-optimization controls
- Music models may show duration, output format, sample rate, bitrate, vocal or instrumental controls, and lyrics options
- Speech models may show voices, modes, formats, and other voice controls depending on the selected model
- Longer text fields, such as lyrics, reference transcript, or voice description, appear as **Model Inputs** instead of compact chips
- If a model input only applies in a certain mode, change the mode first; the matching field appears automatically
- Save settings after changing the model or its controls so the generator uses the new values

### Attaching Reference Files

- Select media items from the grid or list, then choose **Attach** to add them to the generator
- Deselecting files in the grid or list does not remove prompt references; use the references badge to remove attached references
- Selected references appear beside the prompt on desktop and as a **references** badge below the prompt controls
- Open the references badge to review selected files, remove a reference, or change its role when the model supports roles
- Unsupported references stay visible with an inline warning so you can remove them or switch models
- If the selected model needs more references, the generator shows **Attach more references** and disables generation until the requirement is met
- If the selected model only accepts one audio reference, attach exactly one audio file before generating

### Image and Video Workflows

- To edit an image, select one image, choose an image model that accepts references, describe the change, and generate
- To combine images, select multiple images, choose a compatible image model, describe the desired result, and generate
- Some video models accept image references with roles such as **Reference**, **Start Frame**, or **End Frame**; open the references badge to choose the role for each selected file
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

### Speech and Voice Cloning

- For normal speech generation, choose a speech model, enter the words to synthesize in the prompt box, add any delivery direction, and generate
- For voice cloning, choose a cloning-capable speech model such as **QWEN3 TTS**, set the model to clone mode, upload a clean voice clip of the subject speaking, select that audio item as the voice reference, then generate
- Use a short, clear reference clip with one speaker and minimal background noise for cloning
- If the model asks for a reference transcript, enter what is spoken in the reference clip in the model input field
- For voice design, switch to the voice-design mode and describe the voice before generating; the generator warns you if the voice description is missing
- Keep only one voice reference selected for cloning models unless the model explicitly allows more

### Reviewing Generated Media

- Open a media item to preview the output, review the prompt and settings, inspect generated outputs, copy the prompt, or copy download links
- Use the play button on an audio or video grid tile to play it in place without opening the preview dialog
- Generated videos may show thumbnails after processing; if a thumbnail is missing, Media refreshes and backfills it when possible
- Audio items can be previewed from the tile or inside the details dialog

### Using Files with AI

- Files uploaded to Media can be referenced in chats and applets
- Upload images for the AI to analyze or describe
- Upload documents for summarization or Q&A

### Tips

- Keep file names descriptive for easier searching
- Large files and generated videos may take time to upload or finish processing
- Files are stored securely in your personal storage space
