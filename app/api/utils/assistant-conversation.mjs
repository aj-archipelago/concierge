import Chat from "../models/chat.mjs";
import Task from "../models/task.mjs";
import AssistantMessage from "../models/assistant-message.mjs";
import Notification from "../models/notification.mjs";
import {
    getAssistantConversation,
    isShared,
    chatMatchesAssistant,
} from "./colleague-chat.js";
import { withAssistantDispatchLock } from "./agent-tool-capabilities.mjs";
import { appendChatMessage, readChatMessages } from "../chats/message-store.js";

// Upgrade old question-only links lazily. Keep their records; copy history with
// stable receipts before redirecting, so retries never duplicate the transcript.
export async function consolidateQuestionConversation(user, candidate) {
    if (
        !candidate?.assistantQuestionId ||
        String(candidate.userId) !== String(user._id)
    )
        return null;
    return withAssistantDispatchLock(
        `question-conversation:${candidate._id}`,
        async () => {
            const legacy = await Chat.findOne({
                _id: candidate._id,
                userId: user._id,
            });
            if (!legacy || legacy.isChatLoading || (await isShared(legacy)))
                return null;
            const question = await AssistantMessage.findOne({
                _id: legacy.assistantQuestionId,
                owner: user._id,
                toEntityId: null,
            });
            const source =
                question &&
                (await Task.findOne({
                    _id: question.sourceTaskId,
                    owner: user._id,
                }));
            if (
                !source ||
                !chatMatchesAssistant(legacy, user, question.fromEntityId)
            )
                return null;
            let conversation;
            try {
                conversation = await getAssistantConversation(user, source, {
                    create: true,
                });
            } catch (error) {
                if ([403, 404].includes(error.status)) return null;
                throw error;
            }
            const { chat } = conversation;
            if (String(chat._id) === String(legacy._id) || chat.isChatLoading)
                return null;
            const { messages } = await readChatMessages(legacy);
            for (const message of messages) {
                if (!message._id)
                    throw new Error(
                        "Saved conversation message has no identity",
                    );
                await appendChatMessage(chat, message, {
                    dedupeKey: `question-conversation:${legacy._id}:${message._id}`,
                    preserveExisting: true,
                });
            }
            await AssistantMessage.updateMany(
                { owner: user._id, chatId: legacy._id, toEntityId: null },
                { $set: { chatId: chat._id } },
            );
            // Metadata is encrypted; query by owner and replace the whole value.
            const notices = await Notification.find({
                owner: user._id,
                type: "colleague-message",
            });
            for (const notice of notices) {
                if (String(notice.metadata?.chatId) !== String(legacy._id))
                    continue;
                await Notification.updateOne(
                    { _id: notice._id, owner: user._id },
                    {
                        $set: {
                            metadata: {
                                ...notice.metadata,
                                chatId: String(chat._id),
                            },
                        },
                    },
                );
            }
            await Chat.updateOne(
                { _id: legacy._id, userId: user._id },
                { $set: { archived: true } },
            );
            return String(chat._id);
        },
        undefined,
        { waitMs: 2000 },
    );
}
