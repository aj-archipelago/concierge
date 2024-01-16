import ChatMessages from "./ChatMessages";
import { useDispatch, useSelector } from "react-redux";
import { useApolloClient } from "@apollo/client";
import { QUERIES } from "../../graphql";
import { addMessage } from "../../stores/chatSlice";
import { useState } from "react";
import { stripHTML } from "../../utils/html.utils";

const contextMessageCount = 5;

function getServiceName(data) {
    let requestedServices = null;
    let serviceString = "";

    // We can't be sure that the data will be in the format we expect, so we'll
    // wrap this in a try/catch block.
    try {
        requestedServices = JSON.parse(
            (data.select_services || data.select_extension).result,
        );
        serviceString = requestedServices.services.join(", ").toLowerCase();
    } catch (e) {
        console.error(e);
    }

    let serviceName = null;

    if (serviceString) {
        switch (true) {
            case serviceString.includes("translate"):
                serviceName = "translate";
                break;
            case serviceString.includes("coding"):
                serviceName = "code";
                break;
            case serviceString.includes("transcribe"):
                serviceName = "transcribe";
                break;
            case serviceString.includes("write") ||
                serviceString.includes("summary") ||
                serviceString.includes("headlines") ||
                serviceString.includes("entities") ||
                serviceString.includes("spelling") ||
                serviceString.includes("grammar") ||
                serviceString.includes("style") ||
                serviceString.includes("entities"):
                serviceName = "write";
                break;
            // case serviceString.endsWith("upload"):
            //     serviceName = 'upload';
            //     break;
            default:
                break;
        }
    }

    return serviceName;
}

function ChatContent({ displayState = "full", container = "chatpage" }) {
    const client = useApolloClient();
    const [loading, setLoading] = useState(false);
    const messages = useSelector((state) => state.chat.messages);
    const contextId = useSelector((state) => state.chat.contextId);
    const selectedSources = useSelector((state) => state.doc.selectedSources);
    const shouldUseExtension = true; // useSelector(state => state.chat.includeAJArticles);

    const dispatch = useDispatch();

    let serviceName = null;
    // let useExpertSystem = false;
    // let clientTextLanguage = null;

    const updateChat = (data, result) => {
        const dataObj = shouldUseExtension ? data.rag : data.chat_labeeb;
        const { result: message, tool } = dataObj; //,contextId
        setLoading(false);
        // dispatch(setContextId(contextId));
        dispatch(
            addMessage({
                payload: message,
                tool: tool,
                postProcessData: serviceName
                    ? {
                          serviceName,
                      }
                    : null,
                sentTime: "just now",
                direction: "incoming",
                position: "single",
                sender: "labeeb",
            }),
        );
    };

    const handleError = (error) => {
        console.error(error);
        setLoading(false);
    };

    return (
        <ChatMessages
            loading={loading}
            onSend={(text) => {
                // We need to strip the HTML from the text before we send it to the server.
                const display = stripHTML(text);

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

                if (shouldUseExtension) {
                    // client
                    //   .query({
                    //     query: QUERIES.SELECT_EXTENSION,
                    //     variables: {
                    //       text: `${stripHTML(text)}`,
                    //     },
                    //   })
                    //   .then((result) => {
                    //     const { data } = result;
                    //     serviceName = getServiceName(data);
                    //     const extensionResult = JSON.parse(data.select_extension.result);
                    //     useExpertSystem = extensionResult?.useExpertSystem;
                    //     clientTextLanguage = extensionResult?.language;

                    //     if (useExpertSystem) {
                    //       variables.indexName =
                    //         clientTextLanguage === "ara"
                    //           ? "indexucmsaja"
                    //           : "indexucmsaje";
                    //       variables.semanticConfiguration =
                    //         clientTextLanguage === "ara"
                    //           ? "aja_semantic"
                    //           : "aje_semantic";
                    //     }

                    selectedSources &&
                        selectedSources.length > 0 &&
                        (variables.dataSources = selectedSources);

                    client
                        .query({
                            query:
                                // useExpertSystem && shouldUseExtension
                                //   ? QUERIES.CHAT_EXTENSION
                                //   : QUERIES.CHAT_LABEEB,
                                QUERIES.RAG,
                            variables,
                        })
                        .then((result) =>
                            updateChat(result.data, result.result),
                        )
                        .catch(handleError);
                    // })
                    // .catch(handleError);
                } else {
                    client
                        .query({
                            query: QUERIES.SELECT_SERVICES,
                            variables: {
                                text: `User: ${stripHTML(text)}`,
                            },
                        })
                        .then((result) => {
                            serviceName = getServiceName(result.data);
                            client
                                .query({
                                    query: QUERIES.CHAT_LABEEB,
                                    variables,
                                })
                                .then((result) =>
                                    updateChat(result.data, result.result),
                                )
                                .catch(handleError);
                        })
                        .catch(handleError);
                }
            }}
            messages={messages}
            container={container}
            displayState={displayState}
        ></ChatMessages>
    );
}

export default ChatContent;
