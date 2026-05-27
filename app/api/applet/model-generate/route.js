import { NextResponse } from "next/server";
import { getClient } from "../../../../src/graphql";
import { getCurrentUser } from "../../utils/auth.js";
import { buildWorkspacePromptVariables } from "../../utils/llm-file-utils.js";
import config from "../../../../app.config/config/index.js";
import { executeRunWorkspacePrompt } from "../../utils/run-workspace-prompt.js";
import { validateAppletAccess } from "../access.js";
import {
    fetchAppletModelMetadata,
    findAllowedModel,
    isValidReasoningEffort,
} from "../model-utils.js";
import { APPLET_SDK_LIMITS, withAppletSdkGuard } from "../sdk-guard.js";

function normalizeMessages(messages, systemPrompt) {
    const normalized = [];

    if (systemPrompt) {
        normalized.push({ role: "system", content: systemPrompt });
    }

    for (const message of messages) {
        normalized.push({
            role: message.role || "user",
            content: message.content || "",
        });
    }

    return normalized;
}

export async function POST(request) {
    try {
        const {
            appletId,
            prompt,
            messages,
            systemPrompt,
            model,
            reasoningEffort,
        } = await request.json();

        if (!appletId || typeof appletId !== "string") {
            return NextResponse.json(
                { error: "appletId is required" },
                { status: 400 },
            );
        }

        const hasPrompt = typeof prompt === "string" && prompt.trim();
        const hasMessages = Array.isArray(messages) && messages.length > 0;
        if (!hasPrompt && !hasMessages) {
            return NextResponse.json(
                { error: "Either prompt or messages is required" },
                { status: 400 },
            );
        }

        if (
            reasoningEffort !== undefined &&
            reasoningEffort !== null &&
            !isValidReasoningEffort(reasoningEffort)
        ) {
            return NextResponse.json(
                {
                    error: "Invalid reasoningEffort. Must be one of: none, low, medium, high",
                },
                { status: 400 },
            );
        }

        const user = await getCurrentUser();
        const accessError = await validateAppletAccess(appletId, user);
        if (accessError) {
            return accessError;
        }

        return await withAppletSdkGuard({
            appletId,
            userId: user._id,
            api: "models.generate",
            limits: APPLET_SDK_LIMITS.modelGenerate,
            run: async () => {
                const graphqlClient = getClient();
                const modelMetadata =
                    await fetchAppletModelMetadata(graphqlClient);
                const requestedModel = model || modelMetadata.defaultModel;
                const allowedModel = findAllowedModel(
                    modelMetadata,
                    requestedModel,
                );

                if (!allowedModel) {
                    return NextResponse.json(
                        { error: "Model is not available for applets" },
                        { status: 400 },
                    );
                }

                if (
                    reasoningEffort &&
                    !allowedModel.reasoningEfforts.includes(reasoningEffort)
                ) {
                    return NextResponse.json(
                        {
                            error: `reasoningEffort is not supported by ${requestedModel}`,
                        },
                        { status: 400 },
                    );
                }

                const variables = await buildWorkspacePromptVariables({
                    systemPrompt: hasMessages ? null : systemPrompt,
                    text: hasPrompt ? prompt.trim() : "",
                    chatHistory: hasMessages
                        ? normalizeMessages(messages, systemPrompt)
                        : null,
                    appletId,
                    userContextId: user?.contextId || null,
                    userContextKey: user?.contextKey || null,
                    includeUserGlobal: true,
                });

                variables.model =
                    requestedModel || config.cortex.defaultChatModel;
                if (reasoningEffort) {
                    variables.reasoningEffort = reasoningEffort;
                }

                const { response } = await executeRunWorkspacePrompt({
                    graphqlClient,
                    variables,
                    onUnsupportedReasoningEffort: (error) => {
                        console.warn(
                            "[applet model-generate] Cortex rejected reasoningEffort; retried without it.",
                            error?.message || error,
                        );
                    },
                });

                const data = response.data?.run_workspace_prompt;

                return NextResponse.json({
                    result: data?.result || "",
                });
            },
        });
    } catch (error) {
        console.error("Error in applet model-generate:", error);
        return NextResponse.json(
            { error: "Failed to generate model response" },
            { status: 500 },
        );
    }
}
