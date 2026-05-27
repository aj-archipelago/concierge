import { NextResponse } from "next/server";
import { getClient, QUERIES } from "../../../../src/graphql";
import { getCurrentUser } from "../../utils/auth.js";
import {
    buildFileAccessPlan,
    buildRunContext,
} from "../../../../src/utils/fileAccessPlanUtils.js";
import config from "../../../../app.config/config/index.js";
import { validateAppletAccess } from "../access.js";
import { APPLET_SDK_LIMITS, withAppletSdkGuard } from "../sdk-guard.js";

export async function POST(request) {
    try {
        const { messages, systemPrompt, model, appletId } =
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
            run: async () => {
                const graphqlClient = getClient();
                const response = await graphqlClient.query({
                    query: QUERIES.SYS_ENTITY_AGENT,
                    variables,
                    fetchPolicy: "network-only",
                });

                const data = response.data?.sys_entity_agent;

                return NextResponse.json({
                    result: data?.result || "",
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
