import { test, expect } from "@playwright/test";

const imageDataUrl =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";
const audioDataUrl =
    "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=";

const mediaModels = [
    {
        modelId: "gemini-31-flash-image-preview",
        displayName: "Gemini 3.1 Flash Image",
        category: "image",
        provider: "gemini",
        isAvailable: true,
        isDefault: true,
        mediaDefaults: {
            aspectRatio: "1:1",
            image_size: "1K",
            imageSize: "1K",
            size: "1K",
        },
        availableAspectRatios: ["1:1", "16:9"],
        availableImageSizes: ["1K"],
        mediaToggles: [],
    },
    {
        modelId: "google-lyria-3-music",
        displayName: "Lyria 3 Clip",
        category: "audio",
        provider: "gemini",
        isAvailable: true,
        isDefault: false,
        preferredUrlFormat: "gcs",
        mediaDefaults: {
            inputImages: [0, 1],
        },
        mediaToggles: [],
    },
];

const referenceImage = {
    _id: "media-image-1",
    taskId: "media-image-1",
    cortexRequestId: "media-image-1",
    type: "image",
    model: "gemini-31-flash-image-preview",
    status: "completed",
    prompt: "Reference newsroom frame",
    url: imageDataUrl,
    azureUrl: imageDataUrl,
    gcsUrl: "gs://media-e2e/reference-frame.png",
    blobPath: "media/reference-frame.png",
    hash: "reference-hash",
    tags: ["reference"],
    created: 1760000000,
    completed: 1760000001,
};

const audioWithInputImage = {
    _id: "media-audio-1",
    taskId: "media-audio-1",
    cortexRequestId: "media-audio-1",
    type: "audio",
    model: "google-lyria-3-music",
    status: "completed",
    prompt: "Image-only music generation",
    url: audioDataUrl,
    azureUrl: audioDataUrl,
    inputImageUrl: "https://media-e2e.example/reference-frame.png",
    created: 1760000010,
    completed: 1760000011,
};

function mediaPageResponse(items) {
    return {
        mediaItems: items,
        pagination: {
            page: 1,
            limit: 50,
            total: items.length,
            totalPages: 1,
            hasNext: false,
            hasPrev: false,
        },
    };
}

async function stubMediaPage(page, items = [], options = {}) {
    await page.route("**/graphql", async (route) => {
        const body = route.request().postDataJSON();
        if (body?.query?.includes("sys_model_metadata")) {
            await route.fulfill({
                contentType: "application/json",
                body: JSON.stringify({
                    data: {
                        sys_model_metadata: {
                            result: JSON.stringify({
                                models: mediaModels,
                                redirects: {},
                            }),
                        },
                    },
                }),
            });
            return;
        }
        if (body?.query?.includes("lyria_prompt_optimizer")) {
            options.lyriaOptimizerRequests?.push(body);
            await route.fulfill({
                contentType: "application/json",
                body: JSON.stringify({
                    data: {
                        lyria_prompt_optimizer: {
                            result: "Create a 45-second investigative news bed at 96 BPM. The genre and style are restrained electronic minimalism with piano pulses and muted synth bass. The mood is focused, serious, and tense. Use sparse percussion, subtle low strings, spacious reverb, and a clean broadcast-ready mix.",
                        },
                    },
                }),
            });
            return;
        }
        await route.fallback();
    });

    await page.route("**/api/media-items?**", async (route) => {
        if (route.request().method() === "GET") {
            await route.fulfill({
                contentType: "application/json",
                body: JSON.stringify(mediaPageResponse(items)),
            });
            return;
        }
        await route.fallback();
    });

    await page.route("**/api/media-items/cleanup-orphaned", async (route) => {
        await route.fulfill({
            contentType: "application/json",
            body: JSON.stringify({ deletedCount: 0 }),
        });
    });

    await page.route("**/api/media-items/sync-from-storage", async (route) => {
        await route.fulfill({
            contentType: "application/json",
            body: JSON.stringify({ syncedCount: 0 }),
        });
    });

    await page.route("https://media-e2e.example/reference-frame.png", (route) =>
        route.fulfill({
            contentType: "image/png",
            body: Buffer.from(imageDataUrl.split(",")[1], "base64"),
        }),
    );
}

async function captureMediaSubmission(page) {
    const captured = {
        task: null,
        mediaItem: null,
    };

    await page.route("**/api/tasks", async (route) => {
        if (route.request().method() === "POST") {
            captured.task = route.request().postDataJSON();
            await route.fulfill({
                contentType: "application/json",
                body: JSON.stringify({ taskId: "lyria-e2e-task" }),
            });
            return;
        }
        await route.fallback();
    });
    await page.route("**/api/media-items", async (route) => {
        if (route.request().method() === "POST") {
            captured.mediaItem = route.request().postDataJSON();
            await route.fulfill({
                contentType: "application/json",
                body: JSON.stringify({ mediaItem: captured.mediaItem }),
            });
            return;
        }
        await route.fallback();
    });

    return captured;
}

async function openMediaPage(page) {
    await page.addInitScript(() => {
        localStorage.setItem("cortexWebShowTos", new Date().toString());
        localStorage.setItem("media-migration-completed", "true");
        localStorage.removeItem("media-generation-settings");
        localStorage.removeItem("generated-media");
        localStorage.removeItem("media-migration-in-progress");
    });
    await page.goto("/media", { waitUntil: "domcontentloaded" });
    await expect(page.locator('textarea[placeholder*="Describe"]')).toBeVisible(
        {
            timeout: 15000,
        },
    );
}

async function selectLyriaClip(page) {
    await page.getByRole("combobox").click();
    await page.getByRole("option", { name: /lyria 3 clip/i }).click();
    await expect(
        page.getByRole("textbox", {
            name: /describe the music, sound design, or audio idea/i,
        }),
    ).toBeVisible();
}

function getPromptInput(page) {
    return page.getByRole("textbox", {
        name: /describe (the music, sound design, or audio idea|what you want to do with the selected media)/i,
    });
}

test("Lyria prompt assist starts with guide-backed prompts and hides fake settings", async ({
    page,
}) => {
    await stubMediaPage(page);
    await openMediaPage(page);
    await selectLyriaClip(page);

    const promptInput = getPromptInput(page);
    const generateButton = page.getByRole("button", { name: /^generate$/i });
    const promptAssist = page.getByRole("button", {
        name: /help me start a music prompt/i,
    });

    await expect(generateButton).toBeDisabled();
    await expect(promptAssist).toBeEnabled();
    await expect(
        page.getByRole("button", { name: /aspect ratio/i }),
    ).toHaveCount(0);
    await expect(page.getByRole("button", { name: /image size/i })).toHaveCount(
        0,
    );
    await expect(page.getByRole("button", { name: /duration/i })).toHaveCount(
        0,
    );

    await promptAssist.click();
    const firstPrompt = await promptInput.inputValue();
    expect(firstPrompt).toMatch(/genre and style/i);
    expect(firstPrompt).toMatch(/mood/i);
    expect(firstPrompt).toMatch(/tempo and rhythm/i);
    expect(firstPrompt).toMatch(/production quality/i);
    await expect(generateButton).toBeEnabled();
    await expect(
        page.getByRole("button", { name: /enhance music prompt/i }),
    ).toBeEnabled();

    await promptInput.fill("");
    await page
        .getByRole("button", { name: /help me start a music prompt/i })
        .click();
    const secondPrompt = await promptInput.inputValue();
    expect(secondPrompt).not.toBe(firstPrompt);
});

test("Lyria text-only submit sends prompt without hidden settings or image context", async ({
    page,
}) => {
    await stubMediaPage(page);
    const captured = await captureMediaSubmission(page);

    await openMediaPage(page);
    await selectLyriaClip(page);

    const promptInput = getPromptInput(page);
    const prompt =
        "Create a serious investigative news bed at 92 BPM with muted piano pulses, low strings, restrained electronic percussion, and a clean broadcast mix.";

    await promptInput.fill(prompt);
    await page.getByRole("button", { name: /^generate$/i }).click();
    await expect.poll(() => captured.task).not.toBeNull();
    await expect.poll(() => captured.mediaItem).not.toBeNull();

    expect(captured.task).toEqual(
        expect.objectContaining({
            type: "media-generation",
            prompt,
            outputType: "audio",
            model: "google-lyria-3-music",
            inputImageUrl: "",
            source: "media_page",
        }),
    );
    expect(captured.task).not.toHaveProperty("displayPrompt");
    expect(
        captured.task.settings?.models?.["google-lyria-3-music"],
    ).not.toEqual(
        expect.objectContaining({
            audioUseCase: expect.anything(),
            audioStyle: expect.anything(),
            audioMood: expect.anything(),
            duration: expect.anything(),
        }),
    );

    expect(captured.mediaItem).toEqual(
        expect.objectContaining({
            taskId: "lyria-e2e-task",
            prompt,
            type: "audio",
            model: "google-lyria-3-music",
            status: "pending",
        }),
    );
    expect(captured.mediaItem).not.toHaveProperty("inputImageUrl");
});

test("Lyria text plus selected image sends prompt and visual reference together", async ({
    page,
}) => {
    await stubMediaPage(page, [referenceImage]);
    const captured = await captureMediaSubmission(page);

    await openMediaPage(page);
    await selectLyriaClip(page);
    await page.locator(".selection-checkbox").first().click();
    await expect(page.getByText("1 selected")).toBeVisible();

    const promptInput = getPromptInput(page);
    const prompt =
        "Score this newsroom frame as a restrained documentary cue with soft synth pads, brushed percussion, and a subtle hopeful lift.";

    await promptInput.fill(prompt);
    await page.getByRole("button", { name: /^generate$/i }).click();
    await expect.poll(() => captured.task).not.toBeNull();
    await expect.poll(() => captured.mediaItem).not.toBeNull();

    expect(captured.task).toEqual(
        expect.objectContaining({
            type: "media-generation",
            prompt,
            displayPrompt: prompt,
            outputType: "audio",
            model: "google-lyria-3-music",
            inputImageUrl: "gs://media-e2e/reference-frame.png",
            inputImageBlobPath: "media/reference-frame.png",
            inputImageHash: "reference-hash",
            inputTags: ["reference"],
        }),
    );
    expect(
        captured.task.settings?.models?.["google-lyria-3-music"],
    ).not.toEqual(
        expect.objectContaining({
            audioUseCase: expect.anything(),
            audioStyle: expect.anything(),
            audioMood: expect.anything(),
            duration: expect.anything(),
        }),
    );

    expect(captured.mediaItem).toEqual(
        expect.objectContaining({
            taskId: "lyria-e2e-task",
            prompt,
            type: "audio",
            model: "google-lyria-3-music",
            status: "pending",
            inputImageUrl: imageDataUrl,
            tags: ["reference"],
        }),
    );
});

test("Lyria prompt enhancement includes selected image context", async ({
    page,
}) => {
    const lyriaOptimizerRequests = [];

    await stubMediaPage(page, [referenceImage], { lyriaOptimizerRequests });
    await openMediaPage(page);
    await selectLyriaClip(page);
    await page.locator(".selection-checkbox").first().click();
    await expect(page.getByText("1 selected")).toBeVisible();

    const promptInput = getPromptInput(page);

    await promptInput.fill("moody intro");
    await page.getByRole("button", { name: /enhance music prompt/i }).click();

    await expect.poll(() => lyriaOptimizerRequests.length).toBe(1);
    expect(lyriaOptimizerRequests[0].variables).toEqual({
        userPrompt: "moody intro",
        hasInputImages: true,
    });
    await expect(promptInput).toHaveValue(/genre and style/i);
    await expect(promptInput).toHaveValue(/broadcast-ready mix/i);
});

test("Lyria image-only submit sends selected image context without fake audio settings", async ({
    page,
}) => {
    await stubMediaPage(page, [referenceImage]);
    const captured = await captureMediaSubmission(page);

    await openMediaPage(page);
    await selectLyriaClip(page);
    await page.locator(".selection-checkbox").first().click();
    await expect(page.getByText("1 selected")).toBeVisible();

    await page.getByRole("button", { name: /^generate$/i }).click();
    await expect.poll(() => captured.task).not.toBeNull();
    await expect.poll(() => captured.mediaItem).not.toBeNull();

    expect(captured.task).toEqual(
        expect.objectContaining({
            type: "media-generation",
            prompt: "",
            displayPrompt: "Image-only music generation",
            outputType: "audio",
            model: "google-lyria-3-music",
            inputImageUrl: "gs://media-e2e/reference-frame.png",
            inputImageBlobPath: "media/reference-frame.png",
            inputImageHash: "reference-hash",
        }),
    );
    expect(
        captured.task.settings?.models?.["google-lyria-3-music"],
    ).not.toEqual(
        expect.objectContaining({
            audioUseCase: expect.anything(),
            audioStyle: expect.anything(),
            audioMood: expect.anything(),
            duration: expect.anything(),
        }),
    );

    expect(captured.mediaItem).toEqual(
        expect.objectContaining({
            taskId: "lyria-e2e-task",
            prompt: "Image-only music generation",
            type: "audio",
            model: "google-lyria-3-music",
            status: "pending",
            inputImageUrl: imageDataUrl,
            tags: ["reference"],
        }),
    );
});

test("Generated audio detail shows the input image reference", async ({
    page,
}) => {
    await stubMediaPage(page, [audioWithInputImage]);
    await openMediaPage(page);

    await page.locator(".audio-artwork").first().click();

    await expect(page.getByText(/generated audio/i)).toBeVisible();
    await expect(page.getByRole("dialog").locator("audio")).toBeVisible();
    await expect(page.getByText("Input Images")).toBeVisible();
    await expect(page.getByAltText("Input image")).toBeVisible();
    await expect(page.getByText("Close", { exact: true })).toBeVisible();
});
