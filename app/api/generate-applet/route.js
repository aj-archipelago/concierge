import { NextResponse } from "next/server";
import { getClient } from "../../../src/graphql";
import { getCurrentUser } from "../utils/auth";
import config from "../../../config";
import { ensureAppletSdkScript } from "../../../src/utils/appletSdkUtils.js";
import { BUILT_IN_SKILLS } from "../../../src/utils/skills.js";
import {
    DEFAULT_APPLET_REASONING_EFFORT,
    resolvePreferredAppletModel,
} from "../utils/applet-model";
import {
    executeRunWorkspacePrompt,
    RUN_WORKSPACE_PROMPT_PATHWAY,
} from "../utils/run-workspace-prompt.js";
import {
    createGraphqlProgressSseResponse,
    extractTextFromProgressData,
} from "../utils/graphql-progress-sse.js";

export const dynamic = "force-dynamic";

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

function buildChatHistory(prompt) {
    const systemPrompt = `You generate polished, production-ready HTML applets for Concierge users.

Return only a single complete HTML document with inline CSS/JS as needed.

OUTPUT RULES:
- Return ONLY the HTML code. No markdown fences or explanations.
- Prefer semantic HTML, accessible controls, and clear visual hierarchy.
- For media-generation applets, generated JavaScript must call ConciergeSDK.media.models plus ConciergeSDK.media.create/createImage/createVideo/createMusic/createSpeech and monitor with ConciergeSDK.tasks.wait or ConciergeSDK.tasks.get; do not invent completed media URLs or build a separate media pipeline.
- For transcription applets, generated JavaScript must call ConciergeSDK.media.transcribe and poll ConciergeSDK.tasks.get; include local file upload, media URL/YouTube input, media preview, progress/status, and final output; never invent/sample transcript text, use Web Speech, or add fallback transcript paths.
- Keep the code readable and maintainable.

${BUILT_IN_SKILLS.find((skill) => skill.name === "applets")?.content || ""}`;

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
            content: [
                JSON.stringify({
                    type: "text",
                    text: prompt.trim(),
                }),
            ],
        },
    ];
}

export async function POST(req) {
    try {
        const { prompt } = await req.json();

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

        const variables = {
            chatHistory: buildChatHistory(prompt),
            reasoningEffort: DEFAULT_APPLET_REASONING_EFFORT,
            stream: true,
        };

        const graphqlClient = getClient();
        const modelAttempts = getAppletGenerationAttempts(modelFallbacks);

        return createGraphqlProgressSseResponse({
            logPrefix: "generate-applet",
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
                            sendEvent("complete", { html: result.html });
                            closeStream();
                            return;
                        }

                        lastError = result.error || lastError;
                    }

                    sendEvent("error", {
                        error: `${lastError}. Retried once.`,
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
