const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "../../../../..");
const read = (relPath) => fs.readFileSync(path.join(repoRoot, relPath), "utf8");

describe("media audio model wiring", () => {
    test("media metadata includes audio, speech, and upscaling models for the media page", () => {
        const src = read("app/queries/modelMetadata.js");
        expect(src).toMatch(/m\.category\s*===\s*"audio"/);
        expect(src).toMatch(/m\.category\s*===\s*"tts"/);
        expect(src).toMatch(/m\.category\s*===\s*"upscaling"/);
        expect(src).toMatch(/m\.isAvailable\s*!==\s*false/);
    });

    test("model selector groups audio, speech, and upscaling models separately", () => {
        const src = read("src/components/images/hooks/useModelSelection.js");
        expect(src).toMatch(/const audio = \[\]/);
        expect(src).toMatch(/const tts = \[\]/);
        expect(src).toMatch(/const upscaling = \[\]/);
        expect(src).toMatch(/type === "audio"/);
        expect(src).toMatch(/type === "tts"/);
        expect(src).toMatch(/type === "upscaling"/);
        expect(src).toMatch(/return \{ image, video, audio, tts, upscaling \}/);
    });

    test("model selector keeps models visible regardless of selected references", () => {
        const src = read("src/components/images/hooks/useModelSelection.js");
        const availabilitySource = src.slice(
            src.indexOf("const getAvailableModels"),
            src.indexOf(
                "// Keep selection valid if model configuration changes.",
            ),
        );

        expect(availabilitySource).not.toMatch(/selectedImagesObjects/);
        expect(availabilitySource).not.toMatch(/inputImages/);
    });

    test("wizard generation uses the first explicit model selection instead of the global default", () => {
        const pageSrc = read("src/components/images/MediaPage.js");
        const selectionSrc = read(
            "src/components/images/hooks/useModelSelection.js",
        );

        expect(pageSrc).toMatch(/selectedModelRef/);
        expect(pageSrc).toMatch(/selectedModelRef\.current = modelName/);
        expect(pageSrc).toMatch(/flushSync\(\(\) => \{/);
        expect(pageSrc).toMatch(/selectedGenerationModel/);
        expect(pageSrc).toMatch(/setSelectedGenerationModel\(modelName\)/);
        expect(pageSrc).toMatch(/setSelectedGenerationModel\(""\)/);
        expect(pageSrc).toMatch(/const activeMediaModel =/);
        expect(pageSrc).toMatch(/selectedModel:\s*activeMediaModel/);
        expect(pageSrc).toMatch(/model:\s*activeMediaModel/);
        expect(pageSrc).toMatch(/selectedModel=\{activeMediaModel\}/);
        expect(pageSrc).toMatch(
            /if \(selectedModelRef\.current \|\| !mediaModels\?\.length\) return/,
        );
        expect(selectionSrc).toMatch(/setSelectedModel\(\(currentModel\) =>/);
        expect(selectionSrc).toMatch(
            /allAvailableModels\.includes\(modelToCheck\)/,
        );
    });

    test("media page keeps reference requirements outside model availability", () => {
        const src = read("src/components/images/MediaPage.js");
        const styles = read("src/components/images/Media.scss");
        expect(src).toMatch(/selectedModelReferenceMessage/);
        expect(src).toMatch(/selectedAudioForInput/);
        expect(src).toMatch(/hasPromptlessMediaInputs/);
        expect(src).toMatch(/mediaInputModes/);
        expect(src).toMatch(/hasPromptlessMediaInputMode/);
        expect(src).toMatch(/hasSatisfiedPromptlessMediaInputMode/);
        expect(src).toMatch(/buildModelGuidanceItems/);
        expect(src).toMatch(/buildMediaGenerationWizardSteps/);
        expect(src).toMatch(/modelGuidanceItems/);
        expect(src).toMatch(/generationWizardSteps/);
        expect(src).toMatch(/shouldSkipOptionalPrompt/);
        expect(src).toMatch(/selectedModeAllowsPromptlessInput/);
        expect(src).toMatch(/promptOptional/);
        expect(src).toMatch(/Prompt optional with current inputs/);
        expect(src).toMatch(/resetGenerationDraft/);
        expect(src).toMatch(/if \(!selectedGenerationJobType\)/);
        expect(src).toMatch(/MediaGenerationFlow/);
        expect(src).toMatch(/media-generation-flow/);
        expect(src).toMatch(/selectedInputModeKey/);
        expect(src).toMatch(/generationFlowStepIndex/);
        expect(src).toMatch(/formRef\.current\?\.requestSubmit/);
        expect(src).toMatch(/media-settings-parameter-button/);
        expect(src).toMatch(/hasCurrentParameterSettings/);
        expect(src).toMatch(/media-parameters-panel/);
        expect(src).toMatch(/ParameterPromptField/);
        expect(src).toMatch(/AttachmentParameterField/);
        expect(src).toMatch(/ParameterTextField/);
        expect(src).toMatch(/ParameterOptionField/);
        expect(src).toMatch(/ParameterNumberField/);
        expect(src).toMatch(/media-attachment-field/);
        expect(src).toMatch(/media-form-option/);
        expect(src).toMatch(/referenceParameterRows/);
        expect(src).toMatch(/onReferenceParameterClick/);
        expect(src).toMatch(/handleReferenceParameterSelect/);
        expect(src).toMatch(/handleAddSelectedReferencesForRow/);
        expect(src).toMatch(/getReferenceMediaForTargetKind/);
        expect(src).toMatch(/referenceKind: row\?\.kind/);
        expect(src).toMatch(/inputImageRole: VIDEO_EXTEND_REFERENCE_ROLE/);
        expect(src).toMatch(/Select item\(s\) below and click add/);
        expect(src).toMatch(/t\("Add"\)/);
        expect(src).toMatch(/isRequirementMet/);
        expect(src).toMatch(/isCompleteStep \? "complete" : ""/);
        expect(src).not.toMatch(/media-flow-finish-title/);
        expect(styles).toMatch(/media-reference-slot-badge\.met/);
        expect(styles).toMatch(
            /media-attachment-field\.complete \.media-reference-slot/,
        );
        expect(styles).toMatch(/inline-size: fit-content/);
        expect(styles).toMatch(
            /\.media-flow-next\.primary \{[\s\S]*background: #059669/,
        );
        expect(styles).toMatch(
            /\.media-flow-choice-grid \{[\s\S]*padding-block-start: 0\.18rem/,
        );
        expect(styles).not.toMatch(/media-flow-finish-title/);
        expect(src).toMatch(/Selected References/);
        expect(src).toMatch(/getInputModeSummary/);
        expect(src).toMatch(/requiresAnyOf/);
        expect(src).toMatch(/getModeControlInputModes/);
        expect(src).toMatch(/getModeSettingPatch/);
        expect(src).toMatch(/mediaDefaultOverrides/);
        expect(src).toMatch(/getReferencePurposeFromMetadata/);
        expect(src).toMatch(/mediaReferencePurposes/);
        expect(src).toMatch(
            /Use a voice reference for cloning or speech style/,
        );
        expect(src).not.toMatch(/pathwayName !== "video_avatar"/);
        expect(src).not.toMatch(/"video_avatar"/);
        expect(src).toMatch(/inputAudioAttached/);
        expect(src).toMatch(/control\.hideWhen/);
        expect(src).toMatch(/Attach one music item/);
        expect(src).toMatch(/Attach one audio track/);
        expect(src).toMatch(/getEffectiveMediaDefaults/);
        expect(src).toMatch(/isMediaControlVisible/);
        expect(src).toMatch(/showWhen/);
        expect(src).toMatch(/isTextMediaControl/);
        expect(src).toMatch(/TextMediaControl/);
        expect(src).toMatch(/currentStructuredMediaControls/);
        expect(src).toMatch(/Attach one voice reference/);
        expect(src).toMatch(/Attach only one voice reference/);
        expect(src).toMatch(/Attach only one audio track/);
        expect(src).toMatch(/voiceDesignDescriptionMessage/);
        expect(src).toMatch(/Describe the voice before generating/);
        expect(src).toMatch(/isVoiceDesignMode/);
        expect(src).not.toMatch(/getModelInputAvailability/);
        expect(src).not.toMatch(/sortModelIdsByMediaPriority/);
    });

    test("media generation draft resets only when returning to create tiles", () => {
        const src = read("src/components/images/MediaPage.js");
        const modelSelectSource = src.slice(
            src.indexOf("const handleGenerationModelSelect"),
            src.indexOf("const handleGenerationInputModeChoice"),
        );

        expect(src).toMatch(/resetGenerationDraft/);
        expect(src).toMatch(/setPrompt\(""\)/);
        expect(src).toMatch(/setSelectedImages\(new Set\(\)\)/);
        expect(src).toMatch(/setSelectedImagesObjects\(\[\]\)/);
        expect(src).toMatch(/setInputImageRolesById\(\{\}\)/);
        expect(src).toMatch(/if \(!selectedGenerationJobType\)/);
        expect(modelSelectSource).not.toMatch(/setPrompt\(""\)/);
        expect(modelSelectSource).not.toMatch(
            /setSelectedImages\(new Set\(\)\)/,
        );
        expect(modelSelectSource).not.toMatch(
            /setSelectedImagesObjects\(\[\]\)/,
        );
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
        expect(src).toMatch(/typeof source === "object"/);
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
        const fileManagerSource = src.slice(
            src.indexOf("<UnifiedFileManager"),
            src.indexOf("extraBulkActions", src.indexOf("<UnifiedFileManager")),
        );

        expect(src).toMatch(/selectedMediaFileObjects/);
        expect(src).toMatch(/handleAddSelectedFilesAsReferences/);
        expect(fileManagerSource).not.toMatch(/onAttach=/);
        expect(src).toMatch(/function getReferenceMediaFromFile/);
        expect(src).toMatch(/getReferenceMediaFromFile\(file\)/);
        expect(selectionHandler).toMatch(/setSelectedMediaFileObjects/);
        expect(selectionHandler).not.toMatch(/setSelectedImages/);
        expect(selectionHandler).not.toMatch(/setSelectedImagesObjects/);
    });

    test("reference Add button processes the selected file-manager items", () => {
        const src = read("src/components/images/MediaPage.js");
        const addSelectedSource = src.slice(
            src.indexOf("const handleAddSelectedReferencesForRow"),
            src.indexOf("const handleReferenceParameterSelect"),
        );

        expect(addSelectedSource).toMatch(/isFileCompatibleWithReferenceKind/);
        expect(addSelectedSource).toMatch(/remainingSlots/);
        expect(addSelectedSource).toMatch(/selectedMediaFileObjects\.forEach/);
        expect(addSelectedSource).toMatch(/selectedFilesToAdd\.push\(file\)/);
        expect(addSelectedSource).toMatch(/handleAddSelectedFilesAsReferences/);
    });

    test("reference attach path caps new selections at the model max", () => {
        const src = read("src/components/images/MediaPage.js");
        const attachHandler = src.slice(
            src.indexOf("const handleAddSelectedFilesAsReferences"),
            src.indexOf("const getSelectedCompatibleReferenceCount"),
        );

        expect(src).toMatch(/getReferenceMaxForKind/);
        expect(attachHandler).toMatch(/referenceCountsByKind/);
        expect(attachHandler).toMatch(/getReferenceMaxForKind/);
        expect(attachHandler).toMatch(/currentCount >= maxReferences/);
        expect(attachHandler).toMatch(/return;/);
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

    test("media page exposes the compact media model picker and server prompt assistant", () => {
        const src = read("src/components/images/MediaPage.js");
        expect(src).toMatch(/media-model-select-tree/);
        expect(src).toMatch(/expandedCategories/);
        expect(src).toMatch(/title:\s*t\("Image"\)/);
        expect(src).toMatch(/title:\s*t\("Video"\)/);
        expect(src).toMatch(/title:\s*t\("Music"\)/);
        expect(src).toMatch(/title:\s*t\("Speech"\)/);
        expect(src).toMatch(/title:\s*t\("Upscale"\)/);
        expect(src).toMatch(/InlineSettingPicker/);
        expect(src).toMatch(/updateCurrentModelSetting/);
        expect(src).toMatch(/MEDIA_PROMPT_ASSISTANT/);
        expect(src).toMatch(/!prompt\.trim\(\)/);
        expect(src).toMatch(/workflowContext/);
        expect(src).toMatch(/settingsSummary/);
        expect(src).toMatch(/referenceDescriptions/);
        expect(src).toMatch(/suggestionSeed:\s*Math\.floor\(Math\.random\(\)/);
        expect(src).not.toMatch(/availableAudioStyles/);
        expect(src).not.toMatch(/availableAudioMoods/);
        expect(src).not.toMatch(/availableAudioUseCases/);
    });

    test("media page renders schema-backed music controls from model metadata", () => {
        const src = read("src/components/images/MediaPage.js");
        const controls = read("src/utils/mediaModelControls.js");
        expect(src).toMatch(/getAugmentedMediaControls/);
        expect(src).toMatch(/buildMediaModelControls/);
        expect(controls).toMatch(/availableOutputFormats/);
        expect(controls).toMatch(/forceInstrumental/);
        expect(src).toMatch(/NumericSettingsControl/);
        expect(src).toMatch(/InlineNumberSetting/);
    });

    test("speech models use their own picker category while persisting generated files as audio", () => {
        const src = read("src/components/images/MediaPage.js");
        expect(src).toMatch(/getGenerationOutputType/);
        expect(src).toMatch(/if \(type === "tts"\) return "audio"/);
        expect(src).toMatch(/mediaType:\s*selectedModelType/);
        expect(src).toMatch(/outputType:\s*generationOutputType/);
        expect(src).toMatch(/Enhance speech prompt/);
        expect(src).toMatch(/Help me start a speech prompt/);
        expect(src).toMatch(
            /Enter the words to synthesize, plus any voice direction/,
        );
    });

    test("upscaling models use their own picker category while persisting image or video outputs", () => {
        const src = read("src/components/images/MediaPage.js");

        expect(src).toMatch(/if \(type === "upscaling"\)/);
        expect(src).toMatch(/defaults\.inputImages \? "image" : "video"/);
        expect(src).toMatch(/availableModels\.upscaling/);
        expect(src).toMatch(/const upscalingModels = allModelNames/);
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

    test("media preview dialog preserves the file-manager preview URL", () => {
        const src = read("src/components/images/MediaPage.js");
        const previewDialogMatch = src.match(
            /function\s+buildPreviewDialogMedia\([^)]*\)\s*{[\s\S]*?\n}/,
        );
        const modalSourceMatch = src.match(
            /const sourceUrl = getUsableMediaUrl\([\s\S]*?\);/,
        );

        expect(src).toMatch(/getFilePreviewUrl/);
        expect(previewDialogMatch).toBeTruthy();
        expect(previewDialogMatch[0]).toMatch(/file\?\._mediaItem/);
        expect(previewDialogMatch[0]).toMatch(/const previewUrl/);
        expect(previewDialogMatch[0]).toMatch(/_previewUrl:\s*previewUrl/);
        expect(modalSourceMatch).toBeTruthy();
        expect(modalSourceMatch[0]).toMatch(/image\?\._previewUrl/);
        expect(src).toMatch(/const displayUrl =\s*image\?\._previewUrl/);
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

    test("media moves reconcile raw file-manager files back to generated media rows", () => {
        const src = read("src/components/images/MediaPage.js");
        const helperMatch = src.match(
            /function\s+findGeneratedMediaForMove\([^)]*\)\s*{[\s\S]*?\n}/,
        );

        expect(helperMatch).toBeTruthy();
        expect(helperMatch[0]).toMatch(/sortedImages|mediaItems/);
        expect(src).toMatch(/storageFileMatchesExpectedGeneratedFilename/);
        expect(src).toMatch(
            /findGeneratedMediaForMove\(\s*file,\s*sortedImages/,
        );
        expect(src).toMatch(/taskId:\s*generatedMedia\.taskId/);
    });
});
