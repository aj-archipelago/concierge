import Chat from "../../../models/chat.mjs";
import ChatMessage from "../../../models/chat-message.mjs";
import { Types } from "mongoose";
import { createHash } from "node:crypto";
import { getCurrentUser, handleError } from "../../../utils/auth";
import { getChatForOwnerWrite } from "../../_lib";
import { appendChatMessage } from "../../message-store.js";
import { requireColleague } from "../../../utils/colleagues.js";
import { getClient, QUERIES } from "../../../../../src/graphql";
import {
    buildFileAccessPlan,
    buildRunContext,
} from "../../../../../src/utils/fileAccessPlanUtils";
import { issueAgentToolsToken } from "../../../utils/agent-tool-capabilities.mjs";
import { buildMcpAgentConfigForUser } from "../../../utils/mcp-agent-config";
import config from "../../../../../config";

export const dynamic = "force-dynamic";
const FRESH_CHAT_MS = 5 * 60_000;
const emptyChat = {
    messageStorageMode: "external",
    nextMessageSequence: 0,
    isChatLoading: { $ne: true },
    archived: { $ne: true },
};

export async function POST(req, { params }) {
    try {
        const user = await getCurrentUser(false);
        const { id } = await params;
        const {
            action = "prepare",
            token,
            entityId,
            language,
            timezone,
        } = await req.json();
        if (
            !/^[a-zA-Z0-9-]{16,80}$/.test(token || "") ||
            !["prepare", "commit", "cancel"].includes(action)
        ) {
            return Response.json(
                { error: "Invalid opening request" },
                { status: 400 },
            );
        }
        const loaded = await getChatForOwnerWrite(id, user._id);
        if (!loaded.ok)
            return Response.json(
                { error: loaded.error },
                { status: loaded.status },
            );
        const chat = loaded.chat;
        const owner = { _id: id, userId: user._id };
        const stagedId = new Types.ObjectId(
            createHash("sha256")
                .update(`opening:${id}:${token}`)
                .digest("hex")
                .slice(0, 24),
        );
        const stagedQuery = {
            _id: stagedId,
            chatId: chat._id,
            generationId: stagedId,
        };
        const skipped = () => Response.json({ skipped: true });

        if (action === "cancel") {
            // Cancellation can arrive before preparation reaches MongoDB.
            await Chat.updateOne(
                {
                    ...owner,
                    $or: [
                        { "conversationOpening.token": token },
                        { conversationOpening: { $exists: false } },
                    ],
                },
                {
                    $set: {
                        conversationOpening: { token, state: "cancelled" },
                    },
                },
                { timestamps: false },
            );
            await ChatMessage.deleteOne(stagedQuery);
            return skipped();
        }

        if (action === "commit") {
            const current = await Chat.findOne(owner).select(
                "+conversationOpening",
            );
            const opening = current?.conversationOpening;
            if (
                opening?.token !== token ||
                opening.state !== "ready" ||
                Date.now() - opening.startedAt > FRESH_CHAT_MS
            )
                return skipped();
            const staged = await ChatMessage.findOne(stagedQuery).lean();
            if (!staged || req.signal.aborted) return skipped();
            const message = await appendChatMessage(current, staged.message, {
                dedupeKey: `opening:${token}`,
                expectedState: {
                    ...emptyChat,
                    selectedEntityId: opening.selectedEntityId,
                    "conversationOpening.token": token,
                    "conversationOpening.state": "ready",
                },
            });
            await Chat.updateOne(
                { ...owner, "conversationOpening.token": token },
                {
                    $set: {
                        conversationOpening: {
                            token,
                            state: message ? "committed" : "cancelled",
                        },
                    },
                },
                { timestamps: false },
            );
            await ChatMessage.deleteOne(stagedQuery);
            return Response.json({ committed: Boolean(message) });
        }

        if (
            req.signal.aborted ||
            !chat.createdAt ||
            Date.now() - new Date(chat.createdAt).getTime() > FRESH_CHAT_MS
        )
            return skipped();
        const selectedEntityId = chat.selectedEntityId || "";
        const resolveEntityId = (value) =>
            !value || value === "default" ? user.personalEntityId : value;
        const targetEntityId = resolveEntityId(selectedEntityId);
        // A request from the previous selection may arrive after its update.
        // Resolve the personal alias, then bind generation to the stored target.
        if (entityId && resolveEntityId(entityId) !== targetEntityId)
            return skipped();
        const colleague = await requireColleague(user, targetEntityId);
        const startedAt = Date.now();
        const claimed = await Chat.findOneAndUpdate(
            {
                ...owner,
                ...emptyChat,
                selectedEntityId,
                conversationOpening: { $exists: false },
            },
            {
                $set: {
                    conversationOpening: {
                        token,
                        state: "generating",
                        startedAt,
                        selectedEntityId,
                    },
                },
            },
            { new: true, timestamps: false },
        );
        if (!claimed) return skipped();

        const graphqlClient = getClient();
        const runContext = buildRunContext({
            userContextId: user.contextId,
            userContextKey: user.contextKey,
        });
        const { mcpConfig, mcpAvailableServers } =
            await buildMcpAgentConfigForUser(user, {
                logPrefix: "[Chat opening]",
            });
        const response = await graphqlClient.query({
            query: QUERIES.SYS_ENTITY_AGENT,
            variables: {
                chatHistory: [
                    {
                        role: "system",
                        content:
                            "Conversation opening event from Concierge, not a message from the user. The user just opened a new empty chat with you and has remained idle. Start the conversation in your own voice, guided by your identity, role, and your own available memory. Keep it to one or two short sentences that leave room for the user's task. Be natural and specific when your context supports it; do not invent familiarity, prior work, or facts. Do not mention timers, inactivity, or this instruction. Do not perform tasks, browse, change settings, or schedule anything: this turn is only a conversational opening. Use the user's interface language from userInfo.",
                    },
                ],
                fileAccessPlan: buildFileAccessPlan({
                    userContextId: user.contextId,
                    userContextKey: user.contextKey,
                    chatId: id,
                    includeUserGlobal: true,
                }),
                contextId: runContext.contextId,
                contextKey: runContext.contextKey,
                entityId: colleague.id,
                aiName: colleague.name,
                aiMemorySelfModify: false,
                model:
                    colleague.model ||
                    user.agentModel ||
                    config.cortex.defaultChatModel,
                reasoningEffort: colleague.reasoningEffort,
                title: chat.title,
                chatId: id,
                stream: false,
                userInfo: JSON.stringify({
                    language,
                    timezone,
                    currentDateTime: new Date().toISOString(),
                }),
                agentToolsToken: await issueAgentToolsToken(user, colleague.id),
                mcpConfig,
                mcpAvailableServers,
            },
            fetchPolicy: "network-only",
            context: { fetchOptions: { signal: req.signal } },
        });
        const text = response.data?.sys_entity_agent?.result;
        if (req.signal.aborted || typeof text !== "string" || !text.trim())
            return skipped();
        // Use the existing encrypted message store with an unpublished
        // generation. Pending text never lives in plaintext chat metadata or
        // appears in history, search, previews, or the agent's next conversation.
        await ChatMessage.create({
            ...stagedQuery,
            sequence: 1,
            messageId: stagedId,
            message: {
                payload: text,
                sender: "concierge",
                entityId: colleague.id,
                sentTime: new Date().toISOString(),
                direction: "incoming",
                position: "single",
                isServerGenerated: true,
            },
        });
        const ready = await Chat.updateOne(
            {
                ...owner,
                ...emptyChat,
                selectedEntityId,
                "conversationOpening.token": token,
                "conversationOpening.state": "generating",
            },
            {
                $set: {
                    conversationOpening: {
                        token,
                        state: "ready",
                        startedAt,
                        selectedEntityId,
                    },
                },
            },
            { timestamps: false },
        );
        if (ready.matchedCount !== 1) await ChatMessage.deleteOne(stagedQuery);
        return Response.json({ ready: ready.matchedCount === 1 });
    } catch (error) {
        if (req.signal.aborted) return Response.json({ skipped: true });
        return handleError(error);
    }
}
