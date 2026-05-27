const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "../../../../..");
const read = (relPath) => fs.readFileSync(path.join(repoRoot, relPath), "utf8");

describe("media audio model wiring", () => {
    test("media metadata includes audio and speech models for the media page", () => {
        const src = read("app/queries/modelMetadata.js");
        expect(src).toMatch(/m\.category\s*===\s*"audio"/);
        expect(src).toMatch(/m\.category\s*===\s*"tts"/);
        expect(src).toMatch(/m\.isAvailable\s*!==\s*false/);
    });

    test("model selector groups audio and speech models separately", () => {
        const src = read("src/components/images/hooks/useModelSelection.js");
        expect(src).toMatch(/const audio = \[\]/);
        expect(src).toMatch(/const tts = \[\]/);
        expect(src).toMatch(/type === "audio"/);
        expect(src).toMatch(/type === "tts"/);
        expect(src).toMatch(/return \{ image, video, audio, tts \}/);
    });

    test("model selector keeps models visible regardless of selected references", () => {
        const src = read("src/components/images/hooks/useModelSelection.js");
        expect(src).not.toMatch(/selectedImagesObjects/);
        expect(src).not.toMatch(/inputImages/);
    });

    test("media page keeps reference requirements outside model availability", () => {
        const src = read("src/components/images/MediaPage.js");
        expect(src).toMatch(/selectedModelReferenceMessage/);
        expect(src).toMatch(/selectedAudioForInput/);
        expect(src).toMatch(/Attach one music item/);
        expect(src).toMatch(/getEffectiveMediaDefaults/);
        expect(src).toMatch(/mediaDefaultOverrides/);
        expect(src).toMatch(/isMediaControlVisible/);
        expect(src).toMatch(/showWhen/);
        expect(src).toMatch(/isTextMediaControl/);
        expect(src).toMatch(/TextMediaControl/);
        expect(src).toMatch(/currentStructuredMediaControls/);
        expect(src).toMatch(/Attach one voice reference/);
        expect(src).toMatch(/Attach only one voice reference/);
        expect(src).toMatch(/voiceDesignDescriptionMessage/);
        expect(src).toMatch(/Describe the voice before generating/);
        expect(src).toMatch(/isVoiceDesignMode/);
        expect(src).not.toMatch(/getModelInputAvailability/);
        expect(src).not.toMatch(/sortModelIdsByMediaPriority/);
    });

    test("first selected video keeps extend as the default role when more references are selected", () => {
        const src = read("src/components/images/MediaPage.js");
        expect(src).toMatch(/defaultExtendVideoReference/);
        expect(src).toMatch(/image === defaultExtendVideoReference/);
    });

    test("selected reference errors still expose role controls", () => {
        const src = read("src/components/images/MediaPage.js");
        expect(src).toMatch(/media-selected-reference-error-text/);
        expect(src).toMatch(/media-selected-reference-controls/);
    });

    test("selected reference popover tiles keep a fixed size for all media types", () => {
        const styles = read("src/components/images/Media.scss");
        const referenceTileStyles = styles.slice(
            styles.indexOf(".media-selected-reference {"),
            styles.indexOf(".media-selected-reference-audio {"),
        );

        expect(referenceTileStyles).toMatch(/width:\s*5\.5rem/);
        expect(referenceTileStyles).toMatch(/height:\s*5\.5rem/);
        expect(referenceTileStyles).toMatch(/&\.compact/);
        expect(referenceTileStyles).toMatch(/width:\s*2\.5rem/);
        expect(referenceTileStyles).toMatch(/height:\s*2\.5rem/);
    });

    test("selected reference popover tiles expose filenames on hover", () => {
        const src = read("src/components/images/MediaPage.js");
        const styles = read("src/components/images/Media.scss");

        expect(src).toMatch(/image\?\.displayFilename/);
        expect(src).toMatch(/media-selected-reference-name/);
        expect(src).toMatch(/referenceTitle/);
        expect(styles).toMatch(/\.media-selected-reference-name/);
        expect(styles).toMatch(
            /\.media-selected-reference-thumb:hover \.media-selected-reference-name/,
        );
    });

    test("file-list selection adds prompt references only through the explicit action", () => {
        const src = read("src/components/images/MediaPage.js");
        const selectionHandler = src.slice(
            src.indexOf("const handleUnifiedSelectionChange"),
            src.indexOf("// Handle download with error handling"),
        );

        expect(src).toMatch(/selectedMediaFileObjects/);
        expect(src).toMatch(/handleAddSelectedFilesAsReferences/);
        expect(src).toMatch(/onAttach=\{handleAddSelectedFilesAsReferences\}/);
        expect(selectionHandler).toMatch(/setSelectedMediaFileObjects/);
        expect(selectionHandler).not.toMatch(/setSelectedImages/);
        expect(selectionHandler).not.toMatch(/setSelectedImagesObjects/);
    });

    test("failed media selections only expose delete in the bulk bar", () => {
        const src = read("src/components/images/MediaPage.js");

        expect(src).toMatch(/isFailedMediaFile/);
        expect(src).toMatch(/getMediaBulkActionVisibility/);
        expect(src).toMatch(/attach:\s*false/);
        expect(src).toMatch(/download:\s*false/);
        expect(src).toMatch(/move:\s*false/);
        expect(src).toMatch(/selectedObjects\.some\(isFailedMediaFile\)/);
    });

    test("media page exposes the compact three-column model picker and server prompt assistant", () => {
        const src = read("src/components/images/MediaPage.js");
        expect(src).toMatch(/media-model-select-columns/);
        expect(src).toMatch(/title:\s*t\("Image"\)/);
        expect(src).toMatch(/title:\s*t\("Video"\)/);
        expect(src).toMatch(/title:\s*t\("Music"\)/);
        expect(src).toMatch(/title:\s*t\("Speech"\)/);
        expect(src).toMatch(/InlineSettingPicker/);
        expect(src).toMatch(/updateCurrentModelSetting/);
        expect(src).toMatch(/MEDIA_PROMPT_ASSISTANT/);
        expect(src).toMatch(/!prompt\.trim\(\)/);
        expect(src).not.toMatch(/availableAudioStyles/);
        expect(src).not.toMatch(/availableAudioMoods/);
        expect(src).not.toMatch(/availableAudioUseCases/);
    });

    test("media page renders schema-backed music controls from model metadata", () => {
        const src = read("src/components/images/MediaPage.js");
        expect(src).toMatch(/getAugmentedMediaControls/);
        expect(src).toMatch(/availableOutputFormats/);
        expect(src).toMatch(/forceInstrumental/);
        expect(src).toMatch(/NumericSettingsControl/);
        expect(src).toMatch(/InlineNumberSetting/);
    });

    test("speech models use their own picker category while persisting generated files as audio", () => {
        const src = read("src/components/images/MediaPage.js");
        expect(src).toMatch(/getGenerationOutputType/);
        expect(src).toMatch(/type === "tts" \? "audio" : type/);
        expect(src).toMatch(/mediaType:\s*selectedModelType/);
        expect(src).toMatch(/outputType:\s*generationOutputType/);
        expect(src).toMatch(/Enhance speech prompt/);
        expect(src).toMatch(/Help me start a speech prompt/);
        expect(src).toMatch(
            /Enter the words to synthesize, plus any voice direction/,
        );
    });

    test("media page uses distinct badges for ElevenLabs and MiniMax models", () => {
        const src = read("src/components/images/MediaPage.js");
        const styles = read("src/components/images/Media.scss");
        expect(src).toMatch(/elevenlabs/);
        expect(src).toMatch(/minimax/);
        expect(src).toMatch(/media-model-provider-badge-elevenlabs/);
        expect(src).toMatch(/media-model-provider-badge-minimax/);
        expect(styles).toMatch(/media-model-provider-badge-elevenlabs/);
        expect(styles).toMatch(/media-model-provider-badge-minimax/);
    });

    test("image size changes update all backend aliases used by image providers", () => {
        const src = read("src/components/images/MediaPage.js");
        expect(src).toMatch(/key === "image_size"/);
        expect(src).toMatch(/imageSize: value/);
        expect(src).toMatch(/size: value/);
    });

    test("media items persist audio as a first-class type", () => {
        const src = read("app/api/models/media-item.mjs");
        expect(src).toMatch(/enum:\s*\["image", "video", "audio"\]/);
        expect(src).toMatch(/inputAudioUrl:\s*String/);
        expect(src).toMatch(/inputAudioBlobPath:\s*String/);
        expect(src).toMatch(/inputAudioHash:\s*String/);
    });

    test("media upload accepts all media types and stores uploads by media type", () => {
        const page = read("src/components/images/MediaPage.js");
        const hook = read("src/components/images/hooks/useFileUpload.js");

        expect(page).toMatch(/accept="image\/\*,audio\/\*,video\/\*"/);
        expect(hook).toMatch(/mimeType\.startsWith\("audio\/"\)/);
        expect(hook).toMatch(/mimeType\.startsWith\("video\/"\)/);
        expect(hook).toMatch(/AUDIO_EXTENSIONS/);
        expect(hook).toMatch(/VIDEO_EXTENSIONS/);
        expect(hook).toMatch(/t\("Uploaded audio"\)/);
        expect(hook).toMatch(/t\("Uploaded video"\)/);
        expect(hook).toMatch(/type:\s*mediaType/);
    });

    test("image media preview exposes click and touch zoom affordances", () => {
        const src = read("src/components/images/MediaPage.js");
        expect(src).toMatch(/isZoomableImagePreview/);
        expect(src).toMatch(/toggleImageZoom/);
        expect(src).toMatch(/h-\[min\(52vh,420px\)\]/);
        expect(src).toMatch(/flex-shrink-0/);
        expect(src).toMatch(/touch-manipulation/);
        expect(src).toMatch(/touch-pan-x touch-pan-y/);
        expect(src).toMatch(/ZoomIn/);
        expect(src).toMatch(/ZoomOut/);
        expect(src).toMatch(/Zoom in image/);
        expect(src).toMatch(/Zoom out image/);
    });

    test("pending generated media placeholders live directly in the selected output folder", () => {
        const src = read("src/components/images/MediaPage.js");
        const syntheticPathMatch = src.match(
            /function\s+getSyntheticMediaPath\([^)]*\)\s*{[\s\S]*?\n}/,
        );

        expect(syntheticPathMatch).toBeTruthy();
        expect(syntheticPathMatch[0]).toMatch(/media\?\.outputFolder/);
        expect(syntheticPathMatch[0]).not.toMatch(/processing/);
        expect(syntheticPathMatch[0]).not.toMatch(/failed/);
    });

    test("media moves target the media scope, not a nested users tree", () => {
        const src = read("src/components/images/MediaPage.js");
        const movePathMatch = src.match(
            /function\s+getMovedMediaBlobPath\([^)]*\)\s*{[\s\S]*?\n}/,
        );

        expect(movePathMatch).toBeTruthy();
        expect(movePathMatch[0]).toMatch(/return `media\/\$\{relativePath\}`/);
        expect(movePathMatch[0]).not.toMatch(/users\/\$\{userId\}\/media/);
    });

    test("media moves keep failed tiles movable and refresh even when a batch fails", () => {
        const src = read("src/components/images/MediaPage.js");

        expect(src).toMatch(/updates\.outputFolder\s*=\s*normalizedTarget/);
        expect(src).toMatch(/No movable media files selected/);
        expect(src).toMatch(/pendingMoveCount/);
        expect(src).toMatch(/Generated media can be moved after it finishes/);
        expect(src).toMatch(/finally\s*{\s*await refreshMediaLibrary/);
        expect(src).toMatch(/\["failed", "error"\]\.includes\(status\)/);
    });
});
