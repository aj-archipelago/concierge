import { NextResponse } from "next/server";
import { getClient } from "./cortex-client.js";
import { getCurrentUser } from "./auth";
import config from "../../../config";
import { ensureAppletSdkScript } from "../../../src/utils/appletSdkUtils.js";
import { APPLETS_HTML_GENERATION_GUIDE } from "../../../src/utils/skills.js";
import { APPLET_API_SELECTION } from "../../../src/content/appletApiSelection.js";
import { reviewAppletApis } from "../../../src/utils/appletApiReview.js";
import { HTML_CITATION_RULES } from "../../../src/utils/htmlCitationRules.js";
import { reviewHtmlCitations } from "./html-citation-review.js";
import {
    HOME_WIDGET_FORM_FACTOR_RULES,
    HOME_WIDGET_IMAGERY_RULES,
    HOME_WIDGET_USER_REMINDER,
} from "../../../src/utils/homeWidgetCraft.js";
import { resolvePreferredAppletModel } from "./applet-model";
import {
    executeRunWorkspacePrompt,
    RUN_WORKSPACE_PROMPT_PATHWAY,
} from "./run-workspace-prompt.js";
import {
    createGraphqlProgressSseResponse,
    extractTextFromProgressData,
} from "./graphql-progress-sse.js";

function postProcessHtml(html) {
    if (!html) return html;

    let result = html
        .replace(/^```html?\s*\n?/i, "")
        .replace(/\n?```\s*$/i, "")
        .trim();

    const tailwindScript =
        '<script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>';
    if (!result.includes("@tailwindcss/browser")) {
        result = result.replace(/(<head[^>]*>)/i, `$1\n    ${tailwindScript}`);
    }

    return ensureAppletSdkScript(result);
}

function getAppletGenerationAttempts(models) {
    if (models.length > 1) {
        return models;
    }

    return models[0] ? [models[0], models[0]] : [];
}

const MAX_CURRENT_HTML_CHARS = 80000;
const MAX_WIDGET_CURRENT_HTML_CHARS = 40000;
const APPLET_GENERATION_REASONING_EFFORT = "low";
const MAX_SCREENSHOT_CHARS = 1800000;
const SCREENSHOT_HINT =
    "A screenshot or labeled contact sheet of the widget is attached. Inspect the rendered hierarchy, contrast, clipping, control reachability, theme and language behavior. Repair what the image shows while preserving the applet functionality.";

function normalizeScreenshotDataUrl(screenshot) {
    if (typeof screenshot !== "string") return "";
    const trimmed = screenshot.trim();
    if (!/^data:image\/(?:jpeg|jpg|png|webp);base64,/i.test(trimmed)) {
        return "";
    }
    if (trimmed.length > MAX_SCREENSHOT_CHARS) return "";
    return trimmed;
}

function compactCurrentHtml(html, { isHomeWidget } = {}) {
    const trimmed = typeof html === "string" ? html.trim() : "";
    if (!trimmed) return "";

    const compacted = trimmed
        .replace(/src="data:[^"]{500,}"/gi, 'src=""')
        .replace(/url\(\s*['"]?data:[^)]{500,}['"]?\s*\)/gi, "url()");

    const maxChars = isHomeWidget
        ? MAX_WIDGET_CURRENT_HTML_CHARS
        : MAX_CURRENT_HTML_CHARS;
    if (compacted.length > maxChars) {
        return `${compacted.slice(0, maxChars)}\n<!-- truncated -->`;
    }
    return compacted;
}

function buildChatHistory(
    prompt,
    { formFactor, currentHtml, screenshot } = {},
) {
    const isHomeWidget = formFactor === "widget";
    const boundedCurrentHtml = compactCurrentHtml(currentHtml, {
        isHomeWidget,
    });
    const isModify = Boolean(boundedCurrentHtml);
    const appletsSkill = isHomeWidget
        ? ""
        : `\n${APPLETS_HTML_GENERATION_GUIDE}`;
    const systemPrompt = `You generate polished, production-ready HTML applets for Concierge users.

Return only a single complete HTML document with inline CSS/JS as needed.
${APPLET_API_SELECTION}
${HTML_CITATION_RULES}
${isHomeWidget ? `${HOME_WIDGET_FORM_FACTOR_RULES}${HOME_WIDGET_IMAGERY_RULES}` : ""}
OUTPUT RULES:
- Return ONLY the HTML code. No markdown fences or explanations.
- Prefer semantic HTML, accessible controls, and clear visual hierarchy.
- Never put an agentContext ID in generated HTML or UI; the server supplies the saved binding.
- For answers from ConciergeSDK.agent.chat, always pass the complete response to ConciergeSDK.agent.render. Never copy context facts into HTML/JavaScript. Never build custom citation/source/reference chips.
- For media-generation applets, generated JavaScript must call ConciergeSDK.media.models plus ConciergeSDK.media.create/createImage/createVideo/createMusic/createSpeech and monitor with ConciergeSDK.tasks.wait or ConciergeSDK.tasks.get; do not invent completed media URLs or build a separate media pipeline.
- For transcription applets, generated JavaScript must call ConciergeSDK.media.transcribe and poll ConciergeSDK.tasks.get; include local file upload, media URL/YouTube input, media preview, progress/status, and final output; never invent/sample transcript text, use Web Speech, or add fallback transcript paths.
- Keep the code readable and maintainable.
${appletsSkill}`;

    let userText = prompt.trim();
    if (isModify) {
        userText = `Here is the current HTML of the applet:

${boundedCurrentHtml}

Apply these modification instructions and return a complete updated HTML document:
${prompt.trim()}${isHomeWidget ? `\n\n${HOME_WIDGET_USER_REMINDER}` : ""}`;
    } else if (isHomeWidget) {
        userText = `${prompt.trim()}

${HOME_WIDGET_USER_REMINDER}`;
    }

    const screenshotUrl = normalizeScreenshotDataUrl(screenshot);
    if (screenshotUrl) {
        userText = `${SCREENSHOT_HINT}\n\n${userText}`;
    }

    const userContent = [
        JSON.stringify({
            type: "text",
            text: userText,
        }),
    ];
    if (screenshotUrl) {
        userContent.push(
            JSON.stringify({
                type: "image_url",
                url: screenshotUrl,
                image_url: { url: screenshotUrl },
            }),
        );
    }

    return [
        {
            role: "system",
            content: [
                JSON.stringify({
                    type: "text",
                    text: systemPrompt,
                }),
            ],
        },
        {
            role: "user",
            content: userContent,
        },
    ];
}

export async function createAppletGenerationResponse(
    req,
    { timeoutMs, maxAttempts = Infinity, deferCitationReview = false } = {},
) {
    try {
        const { prompt, formFactor, currentHtml, screenshot } =
            await req.json();

        if (!prompt || !prompt.trim()) {
            return NextResponse.json(
                { error: "Prompt is required" },
                { status: 400 },
            );
        }

        await getCurrentUser();

        const preferredModel = resolvePreferredAppletModel(
            config.cortex.defaultChatModel,
        );
        const modelFallbacks = [
            preferredModel,
            config.cortex.defaultChatModel,
        ].filter(
            (model, index, array) => model && array.indexOf(model) === index,
        );

        const normalizedFormFactor =
            formFactor === "widget" ? "widget" : undefined;

        const variables = {
            chatHistory: buildChatHistory(prompt, {
                formFactor: normalizedFormFactor,
                currentHtml,
                screenshot,
            }),
            reasoningEffort:
                normalizedFormFactor === "widget"
                    ? "medium"
                    : APPLET_GENERATION_REASONING_EFFORT,
            stream: true,
        };

        const graphqlClient = getClient();
        const modelAttempts = getAppletGenerationAttempts(modelFallbacks).slice(
            0,
            maxAttempts,
        );

        return createGraphqlProgressSseResponse({
            logPrefix: "generate-applet",
            timeoutMs,
            run: async ({
                sendEvent,
                closeStream,
                unsubscribe,
                subscribeToRequestProgress,
            }) => {
                const runAttempt = async (model) => {
                    const { response } = await executeRunWorkspacePrompt({
                        graphqlClient,
                        variables,
                        models: [model],
                        includeStream: true,
                        onUnsupportedReasoningEffort: (error) => {
                            console.warn(
                                "[generate-applet] Cortex rejected reasoningEffort; retried without it.",
                                error?.message || error,
                            );
                        },
                    });

                    const subscriptionId =
                        response.data?.[RUN_WORKSPACE_PROMPT_PATHWAY]?.result;
                    if (!subscriptionId) {
                        throw new Error(
                            "Cortex did not start applet generation",
                        );
                    }

                    return new Promise((resolve) => {
                        let accumulated = "";

                        const finishFailure = (message) => {
                            unsubscribe();
                            resolve({ ok: false, error: message });
                        };

                        subscribeToRequestProgress(
                            graphqlClient,
                            subscriptionId,
                            {
                                next: (result) => {
                                    const {
                                        progress,
                                        data: resultData,
                                        error,
                                    } = result;

                                    if (error) {
                                        finishFailure(error);
                                        return;
                                    }

                                    const textContent =
                                        extractTextFromProgressData(resultData);

                                    if (textContent) {
                                        accumulated += textContent;
                                        sendEvent("data", {
                                            chunk: textContent,
                                        });
                                    }

                                    if (progress === 1) {
                                        const html =
                                            postProcessHtml(accumulated);
                                        if (html) {
                                            unsubscribe();
                                            resolve({ ok: true, html });
                                            return;
                                        }

                                        finishFailure(
                                            "Applet generation completed without HTML",
                                        );
                                    }
                                },
                                error: (subscriptionError) => {
                                    console.error(
                                        "[generate-applet] Subscription error:",
                                        subscriptionError,
                                    );
                                    finishFailure(
                                        subscriptionError?.message ||
                                            "Subscription failed",
                                    );
                                },
                                complete: () => {
                                    finishFailure(
                                        "Applet generation stream ended before HTML was produced",
                                    );
                                },
                            },
                        );
                    });
                };

                try {
                    let lastError = "Applet generation failed";

                    for (const model of modelAttempts) {
                        let result;
                        try {
                            result = await runAttempt(model);
                        } catch (error) {
                            result = {
                                ok: false,
                                error:
                                    error?.message ||
                                    "Failed to start applet generation",
                            };
                        }

                        if (result.ok) {
                            const issues = [
                                ...reviewAppletApis(result.html),
                                ...(deferCitationReview
                                    ? []
                                    : reviewHtmlCitations(result.html)),
                            ];
                            if (issues.length) {
                                sendEvent("error", {
                                    code: issues[0].code,
                                    error: issues[0].message,
                                });
                                closeStream();
                                return;
                            }
                            sendEvent("complete", { html: result.html });
                            closeStream();
                            return;
                        }

                        lastError = result.error || lastError;
                    }

                    sendEvent("error", {
                        error:
                            modelAttempts.length > 1
                                ? `${lastError}. Retried once.`
                                : lastError,
                    });
                    closeStream();
                } catch (error) {
                    console.error(
                        "[generate-applet] Error setting up subscription:",
                        error,
                    );
                    sendEvent("error", {
                        error: error?.message || "Failed to stream applet",
                    });
                    unsubscribe();
                    closeStream();
                }
            },
        });
    } catch (error) {
        console.error("Error generating applet:", error);
        return NextResponse.json(
            { error: "Failed to generate applet" },
            { status: 500 },
        );
    }
}
