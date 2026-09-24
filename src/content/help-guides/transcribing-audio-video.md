---
id: "transcribing-audio-video"
title: "Transcribing Audio & Video"
category: "transcribe"
date: "2026-09-15"
---

## Transcribing Audio & Video

Convert spoken content into text with Concierge's transcription feature.

### How to Transcribe

1. Go to **Transcribe** from the sidebar
2. Upload an audio or video file, or paste a URL
3. Select the transcription **model** if more than one is available
4. Select the **language** of the content
5. Choose your output format:
    - **Transcript** — plain text output
    - **Subtitles** — VTT format with timestamps
6. Click **Transcribe** to start

### Model Choice

- **Whisper** is the standard transcription model
- **Gemini** is used for YouTube links and can be selected for regular media
- **MAI Transcribe 1.5** appears when it is enabled for the deployment
- **xAI** and **xAI + Gemini** appear only when they are enabled for the deployment

Urdu, Punjabi, and Hindi are available as transcription language hints. Roman Urdu, Punjabi, and Hindi are also available when translating transcript text from the Transcribe workflow.

### Background Processing

Transcription runs as a background task:

- Check progress via the **bell icon** in the header
- You'll see a progress bar and estimated time remaining
- You can continue using other features while it processes

### Live Captions and Translation

When Azure realtime audio is enabled, direct audio and video files show a **Live** control on the player. Use it for:

- **Live captions** — streaming source-language transcription while the file plays
- **Live translation** — translated transcript and translated speech in the target language
- **Captions + translation** — source captions and translated text together

Live capture works with browser-capturable direct media files. For YouTube and remote files that cannot be captured by the browser, use the normal background transcription flow.

### Managing Results

- Completed transcriptions appear in your notifications
- Click on a completed notification to view the result
- Download or copy the transcript for further use

### Reopening Saved Media

You can transcribe a saved upload again without uploading it a second time. Concierge refreshes access to the file when transcription starts. If the file was removed or you no longer have access, select an available file or upload it again.

If Whisper cannot finish a chunk within its time limit, the task fails and releases the worker. Check the failed task in notifications before retrying.

### Tips

- Clear audio produces better transcriptions
- For multi-language content, select the primary language
- Long files may take several minutes to process

### Dedicated transcription models

When enabled, **Gemini 3.5 Transcribe** and **Scribe v2** appear in the transcription model menu. Both support uploaded audio/video, automatic language detection, Arabic, and word timing for VTT/SRT subtitles. Gemini 3.5 Transcribe is separate from the existing **Gemini** option. YouTube links continue to use Gemini. Neither new model changes your default transcription selection.

Choose word timestamps or a words-per-line layout when subtitle timing matters. Check names, code-switching, and timing before publishing. Availability depends on your deployment; Scribe v2 is an optional trial through Replicate.
