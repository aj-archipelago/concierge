import { NextResponse } from "next/server";
import { getClient, QUERIES } from "../../utils/cortex-client.js";
import { getCurrentUser } from "../../utils/auth.js";
import {
    buildFileAccessPlan,
    buildRunContext,
} from "../../../../src/utils/fileAccessPlanUtils.js";
import config from "../../../../app.config/config/index.js";
import Applet from "../../models/applet.js";
import { validateAppletAccess } from "../access.js";
import { APPLET_SDK_LIMITS, withAppletSdkGuard } from "../sdk-guard.js";
import { parseToolMetadata } from "../../utils/tool-metadata.js";
import {
    createGraphqlProgressSseResponse,
    extractTextFromProgressData,
} from "../../utils/graphql-progress-sse.js";

function createAgentChatStreamingResponse({
    graphqlClient,
    variables,
    signal,
}) {
    return createGraphqlProgressSseResponse({
        logPrefix: "applet-agent-chat",
        timeoutMs: 295_000,
        timeoutMessage: "Agent chat request timed out before completion",
        keepAliveMs: 15_000,
        run: async ({
            sendEvent,
            closeStream,
            unsubscribe,
            subscribeToRequestProgress,
        }) => {
            // Flush response headers before Cortex finishes long-running work.
            sendEvent("started", {});

            const response = await graphqlClient.query({
                query: QUERIES.SYS_ENTITY_AGENT,
                variables: { ...variables, stream: true },
                fetchPolicy: "network-only",
                context: signal ? { fetchOptions: { signal } } : undefined,
            });
            const agent = response.data?.sys_entity_agent;
            const subscriptionId = agent?.result;

            if (!subscriptionId) {
                sendEvent("error", {
                    error: "Cortex did not start agent chat streaming",
                });
                closeStream();
                return;
            }

            let accumulated = "";
            const initialTool = parseToolMetadata(agent?.tool);
            const finishFailure = (message) => {
                sendEvent("error", {
                    error: message || "Agent chat streaming failed",
                });
                unsubscribe();
                closeStream();
            };

            subscribeToRequestProgress(graphqlClient, subscriptionId, {
                next: (requestProgress) => {
                    const {
                        progress,
                        data: resultData,
                        info,
                        error,
                    } = requestProgress;

                    if (error) {
                        finishFailure(error);
                        return;
                    }

                    const chunk = extractTextFromProgressData(resultData);
                    if (chunk) {
                        accumulated += chunk;
                        sendEvent("data", { chunk, progress });
                    }

                    if (progress === 1) {
                        if (!accumulated) {
                            accumulated =
                                extractTextFromProgressData(resultData) ||
                                extractTextFromProgressData(
                                    typeof info === "string"
                                        ? info
                                        : JSON.stringify(info || ""),
                                );
                        }
                        const finalTool = parseToolMetadata(
                            typeof info === "string"
                                ? info
                                : info
                                  ? JSON.stringify(info)
                                  : null,
                        );
                        const metadata = {
                            ...initialTool.metadata,
                            ...finalTool.metadata,
                        };
                        sendEvent("complete", {
                            result: accumulated,
                            citations:
                                finalTool.citations.length > 0
                                    ? finalTool.citations
                                    : initialTool.citations,
                            metadata,
                            warnings: agent?.warnings || [],
                            errors: agent?.errors || [],
                        });
                        unsubscribe();
                        closeStream();
                    }
                },
                error: (error) =>
                    finishFailure(error?.message || "Agent chat stream failed"),
                complete: () =>
                    finishFailure(
                        "Agent chat stream ended before the final result was produced",
                    ),
            });
        },
    });
}

export async function POST(request) {
    try {
        const { messages, systemPrompt, model, appletId, stream } =
            await request.json();

        if (!messages || !Array.isArray(messages) || messages.length === 0) {
            return NextResponse.json(
                { error: "messages array is required" },
                { status: 400 },
            );
        }
        if (!appletId || typeof appletId !== "string") {
            return NextResponse.json(
                { error: "appletId is required" },
                { status: 400 },
            );
        }

        const user = await getCurrentUser();
        const accessError = await validateAppletAccess(appletId, user);
        if (accessError) {
            return accessError;
        }
        const applet = await Applet.findById(appletId)
            .select("agentContext")
            .lean();

        // Build chatHistory with optional system prompt
        const chatHistory = [];
        if (systemPrompt) {
            chatHistory.push({ role: "system", content: systemPrompt });
        }
        for (const m of messages) {
            chatHistory.push({
                role: m.role || "user",
                content: m.content || "",
            });
        }

        const fileAccessPlan = buildFileAccessPlan({
            appletId,
            userContextId: user.contextId || null,
            userContextKey: user.contextKey || null,
            includeUserGlobal: true,
        });
        const runContext = buildRunContext({
            appletId,
            userContextId: user.contextId || null,
            userContextKey: user.contextKey || null,
        });

        const variables = {
            chatHistory,
            fileAccessPlan,
            ...(applet?.agentContext
                ? { agentContext: applet.agentContext }
                : {}),
            contextId: runContext.contextId,
            contextKey: runContext.contextKey,
            aiMemorySelfModify: false, // Do not write to user's main memory
            stream: false,
            entityId: user?.personalEntityId || "",
            model: model || config.cortex.defaultChatModel,
        };
        if (user?.aiName) {
            variables.aiName = user.aiName;
        }

        return await withAppletSdkGuard({
            appletId,
            userId: user._id,
            api: "agent.chat",
            limits: APPLET_SDK_LIMITS.agentChat,
            signal: request.signal,
            run: async () => {
                const graphqlClient = getClient();
                if (stream === true) {
                    return createAgentChatStreamingResponse({
                        graphqlClient,
                        variables,
                        signal: request.signal,
                    });
                }
                const response = await graphqlClient.query({
                    query: QUERIES.SYS_ENTITY_AGENT,
                    variables,
                    fetchPolicy: "network-only",
                    context: request.signal
                        ? { fetchOptions: { signal: request.signal } }
                        : undefined,
                });

                const data = response.data?.sys_entity_agent;
                const { citations, metadata } = parseToolMetadata(data?.tool);

                return NextResponse.json({
                    result: data?.result || "",
                    citations,
                    metadata,
                    warnings: data?.warnings || [],
                    errors: data?.errors || [],
                });
            },
        });
    } catch (error) {
        console.error("Error in applet agent-chat:", error);
        return NextResponse.json(
            { error: "Failed to process agent chat" },
            { status: 500 },
        );
    }
}
