import { useDispatch, useSelector } from "react-redux";
import { useApolloClient } from "@apollo/client";
import MessageList from "../chat/MessageList";
import MessageInput from "../chat/MessageInput";
import { QUERIES } from "../../graphql";
import { addMessage } from "../../stores/codeSlice";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import config from "../../../config";

function CodeBox({ contextMessageCount }) {
    const client = useApolloClient();
    const [loading, setLoading] = useState(false);
    const messages = useSelector((state) => state.code.messages);
    const dispatch = useDispatch();
    const [messageId, setMessageId] = useState(0);
    const { t } = useTranslation();

    const content = (
        <div className="h-full flex flex-col gap-3 code-chat-content message-container">
            <div className="grow overflow-auto chat-message-list">
                <MessageList messages={messages} bot="code" loading={loading} />
            </div>
            <div>
                <MessageInput
                    container="codepage"
                    placeholder={t(
                        `Send a message to ${config?.code?.botName}`,
                    )}
                    loading={loading}
                    onSend={(text) => {
                        let currentId = messageId;

                        dispatch(
                            addMessage({
                                id: currentId++,
                                payload: text,
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

                        client
                            .query({
                                query: QUERIES.CHAT_CODE,
                                variables: {
                                    chatHistory: conversation,
                                },
                            })
                            .then((result) => {
                                const { data } = result;
                                const message = data.chat_code.result;
                                setLoading(false);
                                dispatch(
                                    addMessage({
                                        id: currentId++,
                                        payload: message,
                                        sentTime: "just now",
                                        direction: "incoming",
                                        position: "single",
                                        sender: "labeeb",
                                    }),
                                );
                                setMessageId(currentId);
                            });
                    }}
                />
            </div>
        </div>
    );

    return content;
}

export default CodeBox;
