import { useDispatch, useSelector } from "react-redux";
import { useApolloClient } from "@apollo/client";
import { QUERIES } from "../../graphql";
import { addMessage } from "../../stores/chatSlice";
import { useState } from "react";
import dynamic from "next/dynamic";

const ChatMessages = dynamic(() => import("./ChatMessages"));

const contextMessageCount = 5;

function ChatContent({ displayState = "full", container = "chatpage" }) {
    const client = useApolloClient();
    const [loading, setLoading] = useState(false);
    const messages = useSelector((state) => state.chat.messages);
    const contextId = useSelector((state) => state.chat.contextId);
    const selectedSources = useSelector((state) => state.doc.selectedSources);

    const dispatch = useDispatch();

    const updateChat = (data, result) => {
        const dataObj = data.rag_labeeb;
        setLoading(false);
        if (dataObj) {
            const { result: message, tool } = dataObj;
            dispatch(
                addMessage({
                    payload: message,
                    tool: tool,
                    sentTime: "just now",
                    direction: "incoming",
                    position: "single",
                    sender: "labeeb",
                }),
            );
        }
    };

    const handleError = (error) => {
        console.error(error);
        setLoading(false);
    };

    return (
        <ChatMessages
            loading={loading}
            onSend={(text) => {
                const display = text;

                dispatch(
                    addMessage({
                        payload: display,
                        sender: "user",
                        sentTime: "just now",
                        direction: "outgoing",
                        position: "single",
                    }),
                );

                let conversation = messages
                    .slice(-contextMessageCount)
                    .map((m) =>
                        m.sender === "labeeb"
                            ? { role: "assistant", content: m.payload }
                            : { role: "user", content: m.payload },
                    );

                setLoading(true);

                conversation.push({ role: "user", content: text });

                const variables = {
                    chatHistory: conversation,
                    contextId: contextId,
                };

                selectedSources &&
                    selectedSources.length > 0 &&
                    (variables.dataSources = selectedSources);
                client
                    .query({
                        query: QUERIES.RAG_LABEEB,
                        variables,
                    })
                    .then((result) => updateChat(result.data, result.result))
                    .catch(handleError);
            }}
            messages={messages}
            container={container}
            displayState={displayState}
        ></ChatMessages>
    );
}

export default ChatContent;
