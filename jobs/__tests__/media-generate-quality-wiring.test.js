// Static wiring assertions for the media_generate request path.
//
// `quality` is the per-model render-quality preset (low|medium|high|auto)
// that gpt-image-2 (and other Azure /images/generations callers) accept.
// It must flow end-to-end:
//   user setting → buildMediaVariables → MEDIA_GENERATE GraphQL → cortex.
// Until 2026-04, this was silently dropped at the worker layer. These
// regressions-in-disguise are easy to lose to drift, so we lock the wiring
// with a structural test that doesn't depend on running the worker.
//
// We assert by reading the source rather than importing — the worker module
// has unrelated runtime side effects on import that are heavy for jest.

const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "../..");
const read = (relPath) => fs.readFileSync(path.join(repoRoot, relPath), "utf8");

describe("media_generate quality wiring", () => {
    test("worker buildMediaVariables forwards settings.quality", () => {
        const src = read("jobs/tasks/media-generation.mjs");
        const builderMatch = src.match(
            /function\s+buildMediaVariables\([^)]*\)\s*{[\s\S]*?\n}/,
        );
        expect(builderMatch).toBeTruthy();
        expect(builderMatch[0]).toMatch(/quality\s*:\s*settings\.quality/);
    });

    for (const file of ["jobs/graphql.mjs", "src/graphql.js"]) {
        test(`MEDIA_GENERATE in ${file} declares and passes $quality`, () => {
            const src = read(file);
            const queryMatch = src.match(
                /MEDIA_GENERATE\s*=\s*gql`([\s\S]*?)`/,
            );
            expect(queryMatch).toBeTruthy();
            const query = queryMatch[1];
            // The query must declare $quality as a variable…
            expect(query).toMatch(/\$quality\s*:\s*String/);
            // …and forward it into the media_generate field call.
            expect(query).toMatch(/quality\s*:\s*\$quality/);
        });
    }
});

describe("media_generate input image refresh wiring", () => {
    test("worker accepts stable blob/hash identifiers for every input image slot", () => {
        const src = read("jobs/tasks/media-generation.mjs");

        expect(src).toMatch(/function\s+normalizeInputImageReference/);
        expect(src).toMatch(/MAX_INPUT_IMAGE_REFERENCES\s*=\s*14/);
        expect(src).toMatch(
            /pickInputImageValues\(metadata,\s*"inputImageUrl"\)/,
        );
        expect(src).toMatch(
            /pickInputImageValues\(\s*metadata,\s*"inputImageBlobPath"/,
        );
        expect(src).toMatch(
            /pickInputImageValues\(\s*metadata,\s*"inputImageHash"/,
        );
        expect(src).toMatch(
            /blobPath:\s*inputImageBlobPaths\[index\][\s\S]*hash:\s*inputImageHashes\[index\]/,
        );
    });

    test("worker refresh fallbacks keep the Cortex inputImages contract as URLs", () => {
        const src = read("jobs/tasks/media-generation.mjs");
        const refreshListMatch = src.match(
            /async function refreshInputImageUrls\([^)]*\)\s*{[\s\S]*?\n}/,
        );

        expect(refreshListMatch).toBeTruthy();
        expect(refreshListMatch[0]).toMatch(
            /normalizeInputImageReference\(inputImage\)\.url/,
        );
        expect(refreshListMatch[0]).toMatch(/return fallbackUrls/);
    });
});

describe("media_generate input image role wiring", () => {
    test("worker forwards numbered input image roles to Cortex", () => {
        const src = read("jobs/tasks/media-generation.mjs");
        const builderMatch = src.match(
            /function\s+buildMediaVariables\([^)]*\)\s*{[\s\S]*?\n}/,
        );

        expect(builderMatch).toBeTruthy();
        expect(builderMatch[0]).toMatch(/inputImageRoles\s*:/);
        expect(src).toMatch(
            /pickInputImageValues\(\s*metadata,\s*"inputImageRole"/,
        );
        expect(src).toMatch(/inputImageRoles\[index\]/);
    });

    for (const file of ["jobs/graphql.mjs", "src/graphql.js"]) {
        test(`MEDIA_GENERATE in ${file} declares and passes $inputImageRoles`, () => {
            const src = read(file);
            const queryMatch = src.match(
                /MEDIA_GENERATE\s*=\s*gql`([\s\S]*?)`/,
            );
            expect(queryMatch).toBeTruthy();
            const query = queryMatch[1];
            expect(query).toMatch(/\$inputImageRoles\s*:\s*\[String\]/);
            expect(query).toMatch(/inputImageRoles\s*:\s*\$inputImageRoles/);
        });
    }
});

describe("media_generate input video wiring", () => {
    test("worker forwards input videos to Cortex", () => {
        const src = read("jobs/tasks/media-generation.mjs");
        const builderMatch = src.match(
            /function\s+buildMediaVariables\([^)]*\)\s*{[\s\S]*?\n}/,
        );

        expect(builderMatch).toBeTruthy();
        expect(builderMatch[0]).toMatch(/inputVideos\s*:/);
        expect(src).toMatch(
            /pickInputVideoValues\(\s*metadata,\s*"inputVideoUrl"/,
        );
        expect(src).toMatch(/refreshInputVideoUrls/);
    });

    for (const file of ["jobs/graphql.mjs", "src/graphql.js"]) {
        test(`MEDIA_GENERATE in ${file} declares and passes $inputVideos`, () => {
            const src = read(file);
            const queryMatch = src.match(
                /MEDIA_GENERATE\s*=\s*gql`([\s\S]*?)`/,
            );
            expect(queryMatch).toBeTruthy();
            const query = queryMatch[1];
            expect(query).toMatch(/\$inputVideos\s*:\s*\[String\]/);
            expect(query).toMatch(/inputVideos\s*:\s*\$inputVideos/);
        });
    }
});

describe("media_generate Lyria wiring", () => {
    test("worker validation allows image-only audio generation", () => {
        const src = read("jobs/tasks/media-generation.mjs");

        expect(src).toMatch(/isImageOnlyAudioGeneration/);
        expect(src).toMatch(/outputType\s*===\s*"audio"\s*&&\s*hasInputImage/);
        expect(src).toMatch(
            /!prompt\s*&&\s*!isImageOnlyAudioGeneration\s*&&\s*!hasInputAudio/,
        );
    });

    test("worker does not forward fake audio controls to Cortex media_generate", () => {
        const src = read("jobs/tasks/media-generation.mjs");
        const builderMatch = src.match(
            /function\s+buildMediaVariables\([^)]*\)\s*{[\s\S]*?\n}/,
        );
        expect(builderMatch).toBeTruthy();
        expect(builderMatch[0]).not.toMatch(/audioUseCase\s*:/);
        expect(builderMatch[0]).not.toMatch(/audioStyle\s*:/);
        expect(builderMatch[0]).not.toMatch(/audioMood\s*:/);
    });

    for (const file of ["jobs/graphql.mjs", "src/graphql.js"]) {
        test(`MEDIA_GENERATE in ${file} does not declare fake audio variables`, () => {
            const src = read(file);
            const queryMatch = src.match(
                /MEDIA_GENERATE\s*=\s*gql`([\s\S]*?)`/,
            );
            expect(queryMatch).toBeTruthy();
            const query = queryMatch[1];
            expect(query).not.toMatch(/\$audioUseCase\s*:\s*String/);
            expect(query).not.toMatch(/\$audioStyle\s*:\s*String/);
            expect(query).not.toMatch(/\$audioMood\s*:\s*String/);
            expect(query).not.toMatch(/audioUseCase\s*:\s*\$audioUseCase/);
            expect(query).not.toMatch(/audioStyle\s*:\s*\$audioStyle/);
            expect(query).not.toMatch(/audioMood\s*:\s*\$audioMood/);
        });
    }
});

describe("media_generate speech wiring", () => {
    test("worker forwards Qwen TTS clone and design controls to Cortex", () => {
        const src = read("jobs/tasks/media-generation.mjs");
        const builderMatch = src.match(
            /function\s+buildMediaVariables\([^)]*\)\s*{[\s\S]*?\n}/,
        );

        expect(builderMatch).toBeTruthy();
        expect(builderMatch[0]).toMatch(/mode\s*:\s*settings\.mode/);
        expect(builderMatch[0]).toMatch(/language\s*:\s*settings\.language/);
        expect(builderMatch[0]).toMatch(/speaker\s*:\s*settings\.speaker/);
        expect(builderMatch[0]).toMatch(/referenceText\s*:/);
        expect(builderMatch[0]).toMatch(/styleInstruction\s*:/);
        expect(builderMatch[0]).toMatch(/voiceDescription\s*:/);
    });

    for (const file of ["jobs/graphql.mjs", "src/graphql.js"]) {
        test(`MEDIA_GENERATE in ${file} declares and passes Qwen TTS controls`, () => {
            const src = read(file);
            const queryMatch = src.match(
                /MEDIA_GENERATE\s*=\s*gql`([\s\S]*?)`/,
            );
            expect(queryMatch).toBeTruthy();
            const query = queryMatch[1];
            for (const variable of [
                "mode",
                "language",
                "speaker",
                "referenceText",
                "styleInstruction",
                "voiceDescription",
            ]) {
                expect(query).toMatch(
                    new RegExp(`\\$${variable}\\s*:\\s*String`),
                );
                expect(query).toMatch(
                    new RegExp(`${variable}\\s*:\\s*\\$${variable}`),
                );
            }
        });
    }
});

describe("media_generate music parameter wiring", () => {
    test("worker buildMediaVariables forwards music parameters", () => {
        const src = read("jobs/tasks/media-generation.mjs");
        const builderMatch = src.match(
            /function\s+buildMediaVariables\([^)]*\)\s*{[\s\S]*?\n}/,
        );

        expect(builderMatch).toBeTruthy();
        expect(builderMatch[0]).toMatch(/lyrics\s*:\s*settings\.lyrics/);
        expect(builderMatch[0]).toMatch(
            /isInstrumental\s*:\s*settings\.isInstrumental\s*\?\?\s*settings\.is_instrumental/,
        );
        expect(builderMatch[0]).toMatch(
            /lyricsOptimizer\s*:\s*settings\.lyricsOptimizer\s*\?\?\s*settings\.lyrics_optimizer/,
        );
        expect(builderMatch[0]).toMatch(
            /forceInstrumental\s*:\s*settings\.forceInstrumental\s*\?\?\s*settings\.force_instrumental/,
        );
        expect(builderMatch[0]).toMatch(
            /audioUrl\s*:\s*settings\.audioUrl\s*\|\|\s*settings\.audio_url/,
        );
        expect(builderMatch[0]).toMatch(
            /inputAudioUrl\s*:\s*inputAudioUrl\s*\|\|\s*settings\.inputAudioUrl\s*\|\|\s*settings\.input_audio_url/,
        );
        expect(builderMatch[0]).toMatch(
            /audioFormat\s*:\s*settings\.audioFormat\s*\|\|\s*settings\.audio_format/,
        );
        expect(builderMatch[0]).toMatch(
            /sampleRate\s*:\s*settings\.sampleRate\s*\|\|\s*settings\.sample_rate/,
        );
        expect(builderMatch[0]).toMatch(/bitrate\s*:\s*settings\.bitrate/);
    });

    for (const file of ["jobs/graphql.mjs", "src/graphql.js"]) {
        test(`MEDIA_GENERATE in ${file} declares and passes music variables`, () => {
            const src = read(file);
            const queryMatch = src.match(
                /MEDIA_GENERATE\s*=\s*gql`([\s\S]*?)`/,
            );
            expect(queryMatch).toBeTruthy();
            const query = queryMatch[1];
            expect(query).toMatch(/\$lyrics\s*:\s*String/);
            expect(query).toMatch(/\$isInstrumental\s*:\s*Boolean/);
            expect(query).toMatch(/\$lyricsOptimizer\s*:\s*Boolean/);
            expect(query).toMatch(/\$forceInstrumental\s*:\s*Boolean/);
            expect(query).toMatch(/\$audioUrl\s*:\s*String/);
            expect(query).toMatch(/\$inputAudioUrl\s*:\s*String/);
            expect(query).toMatch(/\$audioFormat\s*:\s*String/);
            expect(query).toMatch(/\$sampleRate\s*:\s*Int/);
            expect(query).toMatch(/\$bitrate\s*:\s*Int/);
            expect(query).toMatch(/lyrics\s*:\s*\$lyrics/);
            expect(query).toMatch(/isInstrumental\s*:\s*\$isInstrumental/);
            expect(query).toMatch(/lyricsOptimizer\s*:\s*\$lyricsOptimizer/);
            expect(query).toMatch(
                /forceInstrumental\s*:\s*\$forceInstrumental/,
            );
            expect(query).toMatch(/audioUrl\s*:\s*\$audioUrl/);
            expect(query).toMatch(/inputAudioUrl\s*:\s*\$inputAudioUrl/);
            expect(query).toMatch(/audioFormat\s*:\s*\$audioFormat/);
            expect(query).toMatch(/sampleRate\s*:\s*\$sampleRate/);
            expect(query).toMatch(/bitrate\s*:\s*\$bitrate/);
        });
    }
});

describe("media_generate speech parameter wiring", () => {
    test("worker buildMediaVariables forwards metadata-backed speech controls", () => {
        const src = read("jobs/tasks/media-generation.mjs");
        const builderMatch = src.match(
            /function\s+buildMediaVariables\([^)]*\)\s*{[\s\S]*?\n}/,
        );

        expect(builderMatch).toBeTruthy();
        expect(builderMatch[0]).toMatch(/voiceName\s*:\s*settings\.voiceName/);
        expect(builderMatch[0]).toMatch(
            /speaker1Name\s*:\s*settings\.speaker1Name/,
        );
        expect(builderMatch[0]).toMatch(
            /speaker1VoiceName\s*:\s*settings\.speaker1VoiceName/,
        );
        expect(builderMatch[0]).toMatch(
            /speaker2Name\s*:\s*settings\.speaker2Name/,
        );
        expect(builderMatch[0]).toMatch(
            /speaker2VoiceName\s*:\s*settings\.speaker2VoiceName/,
        );
        expect(builderMatch[0]).toMatch(/voice\s*:\s*settings\.voice/);
        expect(builderMatch[0]).toMatch(/stability\s*:\s*settings\.stability/);
        expect(builderMatch[0]).toMatch(/similarityBoost\s*:/);
        expect(builderMatch[0]).toMatch(/style\s*:\s*settings\.style/);
        expect(builderMatch[0]).toMatch(/speed\s*:\s*settings\.speed/);
        expect(builderMatch[0]).toMatch(/previousText\s*:/);
        expect(builderMatch[0]).toMatch(/nextText\s*:/);
        expect(builderMatch[0]).toMatch(/languageCode\s*:/);
        expect(builderMatch[0]).toMatch(/voiceId\s*:/);
        expect(builderMatch[0]).toMatch(/customVoiceId\s*:/);
        expect(builderMatch[0]).toMatch(/volume\s*:\s*settings\.volume/);
        expect(builderMatch[0]).toMatch(/pitch\s*:\s*settings\.pitch/);
        expect(builderMatch[0]).toMatch(/emotion\s*:\s*settings\.emotion/);
        expect(builderMatch[0]).toMatch(/channel\s*:\s*settings\.channel/);
        expect(builderMatch[0]).toMatch(/languageBoost\s*:/);
        expect(builderMatch[0]).toMatch(/subtitleEnable\s*:/);
        expect(builderMatch[0]).toMatch(/englishNormalization\s*:/);
    });

    for (const file of ["jobs/graphql.mjs", "src/graphql.js"]) {
        test(`MEDIA_GENERATE in ${file} declares and passes speech variables`, () => {
            const src = read(file);
            const queryMatch = src.match(
                /MEDIA_GENERATE\s*=\s*gql`([\s\S]*?)`/,
            );
            expect(queryMatch).toBeTruthy();
            const query = queryMatch[1];
            expect(query).toMatch(/\$voiceName\s*:\s*String/);
            expect(query).toMatch(/\$speaker1Name\s*:\s*String/);
            expect(query).toMatch(/\$speaker1VoiceName\s*:\s*String/);
            expect(query).toMatch(/\$speaker2Name\s*:\s*String/);
            expect(query).toMatch(/\$speaker2VoiceName\s*:\s*String/);
            expect(query).toMatch(/\$voice\s*:\s*String/);
            expect(query).toMatch(/\$stability\s*:\s*Float/);
            expect(query).toMatch(/\$similarityBoost\s*:\s*Float/);
            expect(query).toMatch(/\$style\s*:\s*Float/);
            expect(query).toMatch(/\$speed\s*:\s*Float/);
            expect(query).toMatch(/\$previousText\s*:\s*String/);
            expect(query).toMatch(/\$nextText\s*:\s*String/);
            expect(query).toMatch(/\$languageCode\s*:\s*String/);
            expect(query).toMatch(/\$voiceId\s*:\s*String/);
            expect(query).toMatch(/\$customVoiceId\s*:\s*String/);
            expect(query).toMatch(/\$volume\s*:\s*Float/);
            expect(query).toMatch(/\$pitch\s*:\s*Int/);
            expect(query).toMatch(/\$emotion\s*:\s*String/);
            expect(query).toMatch(/\$channel\s*:\s*String/);
            expect(query).toMatch(/\$languageBoost\s*:\s*String/);
            expect(query).toMatch(/\$subtitleEnable\s*:\s*Boolean/);
            expect(query).toMatch(/\$englishNormalization\s*:\s*Boolean/);
            expect(query).toMatch(/voiceName\s*:\s*\$voiceName/);
            expect(query).toMatch(/speaker1Name\s*:\s*\$speaker1Name/);
            expect(query).toMatch(
                /speaker1VoiceName\s*:\s*\$speaker1VoiceName/,
            );
            expect(query).toMatch(/speaker2Name\s*:\s*\$speaker2Name/);
            expect(query).toMatch(
                /speaker2VoiceName\s*:\s*\$speaker2VoiceName/,
            );
            expect(query).toMatch(/voice\s*:\s*\$voice/);
            expect(query).toMatch(/stability\s*:\s*\$stability/);
            expect(query).toMatch(/similarityBoost\s*:\s*\$similarityBoost/);
            expect(query).toMatch(/style\s*:\s*\$style/);
            expect(query).toMatch(/speed\s*:\s*\$speed/);
            expect(query).toMatch(/previousText\s*:\s*\$previousText/);
            expect(query).toMatch(/nextText\s*:\s*\$nextText/);
            expect(query).toMatch(/languageCode\s*:\s*\$languageCode/);
            expect(query).toMatch(/voiceId\s*:\s*\$voiceId/);
            expect(query).toMatch(/customVoiceId\s*:\s*\$customVoiceId/);
            expect(query).toMatch(/volume\s*:\s*\$volume/);
            expect(query).toMatch(/pitch\s*:\s*\$pitch/);
            expect(query).toMatch(/emotion\s*:\s*\$emotion/);
            expect(query).toMatch(/channel\s*:\s*\$channel/);
            expect(query).toMatch(/languageBoost\s*:\s*\$languageBoost/);
            expect(query).toMatch(/subtitleEnable\s*:\s*\$subtitleEnable/);
            expect(query).toMatch(
                /englishNormalization\s*:\s*\$englishNormalization/,
            );
        });
    }
});

describe("media_generate input audio reference wiring", () => {
    test("worker refreshes selected input audio before submission", () => {
        const src = read("jobs/tasks/media-generation.mjs");

        expect(src).toMatch(/async function refreshInputAudioUrls/);
        expect(src).toMatch(/metadata\.inputAudioUrl/);
        expect(src).toMatch(/metadata\.inputAudioBlobPath/);
        expect(src).toMatch(/metadata\.inputAudioHash/);
        expect(src).toMatch(/pickInputAudioMetadataFields/);
        expect(src).toMatch(/modelMeta\?\.mediaDefaults\?\.inputAudio/);
        expect(src).toMatch(/hasInputAudio/);
    });
});

describe("media_generate output folder wiring", () => {
    test("worker moves completed media into the requested output folder before persistence", () => {
        const src = read("jobs/tasks/media-generation.mjs");

        expect(src).toMatch(/function\s+getMediaFolderTargetBlobPath/);
        expect(src).toMatch(/moveUploadedMediaToOutputFolder/);
        expect(src).toMatch(/metadata\.outputFolder/);
        expect(src).toMatch(/targetBlobPath/);
        expect(src).toMatch(/outputFolder:\s*metadata\.outputFolder/);
    });

    test("worker falls back to multipart upload when CFH cannot fetch provider URLs", () => {
        const src = read("jobs/tasks/media-generation.mjs");

        expect(src).toMatch(/async\s+uploadBufferData\(/);
        expect(src).toMatch(/import\s+mime\s+from\s+"mime-types"/);
        expect(src).toMatch(/mime\.extension\(normalized\)/);
        expect(src).toMatch(/Remote fetch upload failed/);
        expect(src).toMatch(
            /return\s+this\.uploadBufferData\(\s*buffer,\s*serverUrl,\s*routingParams,\s*prompt,\s*extension,\s*hash,\s*contentType/s,
        );
        expect(src).toMatch(
            /metadata\.displayPrompt\s*\|\|\s*metadata\.prompt/,
        );
        expect(src).toMatch(/getGeneratedMediaTaskSuffix\(metadata\.taskId\)/);
        expect(src).toMatch(
            /getGeneratedMediaFilename\(\s*prompt,\s*extension,\s*\{\s*uniqueSuffix:\s*filenameSuffix\s*\|\|\s*mediaHash,\s*\}\s*\)/,
        );
    });
});

describe("media generation auto-tagging wiring", () => {
    test("worker calls the cheap prompt-tag pathway and merges existing tags", () => {
        const src = read("jobs/tasks/media-generation.mjs");

        expect(src).toMatch(/MEDIA_PROMPT_TAGS/);
        expect(src).toMatch(/async\s+getPromptTags\(client,\s*prompt\)/);
        expect(src).toMatch(/media_prompt_tags\?\.result/);
        expect(src).toMatch(/const\s+existingMediaItem\s*=/);
        expect(src).toMatch(
            /mergeMediaTags\(\s*existingMediaItem\?\.tags,\s*inheritedTags,\s*promptTags,\s*\)/,
        );
    });

    for (const file of ["jobs/graphql.mjs", "src/graphql.js"]) {
        test(`${file} exposes the media_prompt_tags pathway`, () => {
            const src = read(file);
            const queryMatch = src.match(
                /MEDIA_PROMPT_TAGS\s*=\s*gql`([\s\S]*?)`/,
            );

            expect(queryMatch).toBeTruthy();
            expect(queryMatch[1]).toMatch(/media_prompt_tags\(text:\s*\$text/);
            expect(src).toMatch(/MEDIA_PROMPT_TAGS,/);
        });
    }
});

describe("media generation blob path persistence", () => {
    test("worker falls back to file handler name or storage URL when blobPath is absent", () => {
        const src = read("jobs/tasks/media-generation.mjs");
        const validateMatch = src.match(
            /validateCloudUrls\(data\)\s*{[\s\S]*?\n {4}}/,
        );

        expect(validateMatch).toBeTruthy();
        expect(validateMatch[0]).toMatch(/responseData\.blobPath/);
        expect(validateMatch[0]).toMatch(/responseData\.name/);
        expect(validateMatch[0]).toMatch(/extractBlobPathFromUrl\(azureUrl\)/);
        expect(validateMatch[0]).toMatch(/extractBlobPathFromUrl\(gcsUrl\)/);
    });
});
