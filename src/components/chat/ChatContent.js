import { useSelector } from "react-redux";
import { useApolloClient } from "@apollo/client";
import { QUERIES } from "../../graphql";
import { useState, useContext } from "react";
import { useUpdateAiMemory } from "../../../app/queries/options";
import { AuthContext } from "../../App.js";
import ChatMessages from "./ChatMessages";
import { toast } from "react-toastify";
import { useTranslation } from "react-i18next";
import {
    useGetActiveChat,
    useAddMessage,
    useUpdateChat,
} from "../../../app/queries/chats";
const contextMessageCount = 50;

function ChatContent({ displayState = "full", container = "chatpage" }) {
    const { t } = useTranslation();
    const client = useApolloClient();
    const { user } = useContext(AuthContext);
    const [loading, setLoading] = useState(false);
    const chat = useGetActiveChat()?.data;
    // const messages = useMemo(
    //     () => chat?.messages || [],
    //     [chat?.messages],
    // );
    const messages = chat?.messages || [];
    const selectedSources = useSelector((state) => state.doc.selectedSources);
    const updateAiMemoryMutation = useUpdateAiMemory();
    const addMessage = useAddMessage();
    const updateChatHook = useUpdateChat();

    const updateChat = (message, tool) => {
        setLoading(false);
        if (message) {
            addMessage.mutate({
                chatId: String(chat?._id),
                message: {
                    payload: message,
                    tool: tool,
                    sentTime: "just now",
                    direction: "incoming",
                    position: "single",
                    sender: "labeeb",
                },
            });

            if (!chat?.title || chat?.title === "New Chat") {
                const text =
                    messages.map(({ payload }) => payload).join(" ") + message;
                client
                    .query({
                        query: QUERIES.HEADLINE,
                        variables: {
                            text,
                            targetLength: 30,
                            count: 1,
                        },
                    })
                    .then(async (result) => {
                        const title = result.data?.headline?.result[0];
                        await updateChatHook.mutateAsync({
                            chatId: String(chat?._id),
                            title,
                        });
                    })
                    .catch((error) => {
                        // console.error("Error fetching chat title:", error);
                    });
            }
        }
    };

    const handleError = (error) => {
        toast.error(error.message);
        updateChat(
            t(
                "Something went wrong trying to respond to your request. Please try something else or start over to continue.",
            ),
            null,
        );
        setLoading(false);
    };

    return (
        <>
            <ChatMessages
                loading={loading}
                onSend={(text) => {
                    const display = text;
                    addMessage.mutate({
                        chatId: String(chat?._id),
                        message: {
                            payload: display,
                            sender: "user",
                            sentTime: "just now",
                            direction: "outgoing",
                            position: "single",
                        },
                    });

                    setLoading(true);

                    let conversation = messages
                        .slice(-contextMessageCount)
                        .filter((m) => {
                            if (!m.tool) return true;
                            try {
                                const tool = JSON.parse(m.tool);
                                return !tool.hideFromModel;
                            } catch (e) {
                                console.error("Invalid JSON in tool:", e);
                                return true;
                            }
                        })
                        .map((m) =>
                            m.sender === "labeeb"
                                ? { role: "assistant", content: m.payload }
                                : { role: "user", content: m.payload },
                        );

                    conversation.push({ role: "user", content: text });

                    const { userId, contextId, aiMemorySelfModify } = user;

                    const variables = {
                        chatHistory: conversation,
                        contextId: contextId,
                        aiName: "Labeeb",
                        aiMemorySelfModify: aiMemorySelfModify,
                    };

                    selectedSources &&
                        selectedSources.length > 0 &&
                        (variables.dataSources = selectedSources);
                    client
                        .query({
                            query: QUERIES.RAG_START,
                            variables,
                        })
                        .then((result) => {
                            let resultMessage = "";
                            let searchRequired = false;
                            let aiMemory = "";
                            let tool = null;

                            try {
                                const resultObj = JSON.parse(
                                    result.data.rag_start.result,
                                );
                                resultMessage = resultObj?.response;

                                tool = result.data.rag_start.tool;
                                if (tool) {
                                    const toolObj = JSON.parse(
                                        result.data.rag_start.tool,
                                    );
                                    searchRequired = toolObj?.search;
                                    aiMemory = toolObj?.aiMemory;

                                    updateAiMemoryMutation.mutateAsync({
                                        userId,
                                        contextId,
                                        aiMemory,
                                        aiMemorySelfModify,
                                    });
                                }
                            } catch (e) {
                                handleError(e);
                                resultMessage = e.message;
                            }
                            updateChat(resultMessage, tool);
                            if (searchRequired) {
                                setLoading(true);
                                client
                                    .query({
                                        query: QUERIES.RAG_GENERATOR_RESULTS,
                                        variables,
                                    })
                                    .then((result) => {
                                        const { result: message, tool } =
                                            result.data.rag_generator_results;
                                        updateChat(message, tool);
                                    })
                                    .catch(handleError);
                            }
                        })
                        .catch(handleError);
                }}
                messages={messages}
                container={container}
                displayState={displayState}
            ></ChatMessages>
        </>
    );
}

export default ChatContent;
