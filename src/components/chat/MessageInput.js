import React from "react";
import { useApolloClient } from "@apollo/client";
import "highlight.js/styles/github.css";
import dynamic from "next/dynamic";
import { useContext, useEffect, useState } from "react";
import { FilePlus, XCircle, StopCircle, Send } from "lucide-react";
import { useDispatch } from "react-redux";
import TextareaAutosize from "react-textarea-autosize";
import { v4 as uuidv4 } from "uuid";
import { useGetActiveChatId } from "../../../app/queries/chats";
import { useAddDocument } from "../../../app/queries/uploadedDocs";
import classNames from "../../../app/utils/class-names";
import { AuthContext } from "../../App";
import { COGNITIVE_INSERT } from "../../graphql";
import {
    clearFileLoading,
    loadingError,
    setFileLoading,
} from "../../stores/fileUploadSlice";
import {
    ACCEPTED_FILE_TYPES,
    getFilename,
    isDocumentUrl,
    isMediaUrl,
} from "../../utils/mediaUtils";

const DynamicFilepond = dynamic(() => import("./MyFilePond"), {
    ssr: false,
});

// Displays the list of messages and a message input box.
function MessageInput({
    onSend,
    loading,
    enableRag,
    placeholder,
    viewingReadOnlyChat,
    isStreaming,
    onStopStreaming,
    initialShowFileUpload = false,
}) {
    const activeChatId = useGetActiveChatId();

    const { user, userState, debouncedUpdateUserState } =
        useContext(AuthContext);
    const contextId = user?.contextId;
    const dispatch = useDispatch();
    const client = useApolloClient();
    const [isUploadingMedia, setIsUploadingMedia] = useState(false);
    const addDocument = useAddDocument();

    // Only set input value on initial mount or chat change
    useEffect(() => {
        if (
            activeChatId &&
            userState?.chatInputs &&
            userState.chatInputs[activeChatId]
        ) {
            setInputValue(userState.chatInputs[activeChatId]);
        } else {
            setInputValue("");
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeChatId]); // Only depend on activeChatId, not userState

    const [inputValue, setInputValue] = useState("");
    const [urlsData, setUrlsData] = useState([]);
    const [files, setFiles] = useState([]);
    const [showFileUpload, setShowFileUpload] = useState(initialShowFileUpload);

    const prepareMessage = (inputText) => {
        return [
            JSON.stringify({ type: "text", text: inputText }),
            ...(urlsData || [])?.map(({ url, gcs }) => {
                const obj = {
                    type: "image_url",
                };

                if (gcs) {
                    obj.gcs = gcs;
                    obj.url = url;
                    obj.image_url = {
                        url: gcs,
                    };
                } else {
                    obj.image_url = { url };
                }

                return JSON.stringify(obj);
            }),
        ];
    };

    const handleInputChange = (event) => {
        const newValue = event.target.value;
        setInputValue(newValue);

        if (activeChatId) {
            debouncedUpdateUserState((prevState) => ({
                chatInputs: {
                    ...(prevState?.chatInputs || {}),
                    [activeChatId]: newValue,
                },
            }));
        }
    };

    const handleFormSubmit = (event) => {
        event.preventDefault();
        if (isUploadingMedia) {
            return; // Prevent submission if a file is uploading
        }

        if (!loading && inputValue) {
            const message = prepareMessage(inputValue);
            onSend(urlsData && urlsData.length > 0 ? message : inputValue);
            setInputValue("");
            setFiles([]);
            setUrlsData([]);
            setShowFileUpload(false);

            if (activeChatId) {
                debouncedUpdateUserState((prevState) => ({
                    chatInputs: {
                        ...(prevState?.chatInputs || {}),
                        [activeChatId]: "",
                    },
                }));
            }
        }
    };

    const addUrl = (urlData) => {
        const { url } = urlData;
        const fetchData = async (url) => {
            if (!url) return;

            try {
                const docId = uuidv4();
                const filename = getFilename(url);

                dispatch(setFileLoading());

                client
                    .query({
                        query: COGNITIVE_INSERT,
                        variables: {
                            file: url,
                            privateData: true,
                            contextId,
                            docId,
                            chatId: activeChatId,
                        },
                        fetchPolicy: "network-only",
                    })
                    .then(() => {
                        // completed successfully
                        addDocument.mutateAsync({
                            docId,
                            filename,
                            chatId: activeChatId,
                        });
                        dispatch(clearFileLoading());
                    })
                    .catch((err) => {
                        console.error(err);
                        dispatch(loadingError(err.toString()));
                    });
            } catch (err) {
                console.warn("Error in file upload", err);
                dispatch(loadingError(err.toString()));
            }
        };

        //check if url is doc type and process accordingly
        if (isDocumentUrl(url)) {
            fetchData(url);
        } else {
            //media urls, will be sent with active message
            if (isMediaUrl(url)) {
                setUrlsData((prevUrlsData) => [...prevUrlsData, urlData]);
            }
        }
    };

    return (
        <div>
            {showFileUpload && (
                <DynamicFilepond
                    addUrl={addUrl}
                    files={files}
                    setFiles={setFiles}
                    setIsUploadingMedia={setIsUploadingMedia}
                    setUrlsData={setUrlsData}
                />
            )}
            <div className="rounded-md border dark:border-zinc-200 mt-3">
                <form
                    onSubmit={handleFormSubmit}
                    className="flex items-end rounded-md dark:bg-zinc-100"
                >
                    {enableRag && (
                        <div className="flex items-end px-3 pb-1">
                            {!showFileUpload ? (
                                <button
                                    onClick={() => {
                                        setShowFileUpload(true);
                                    }}
                                    className="hover:bg-gray-100 rounded-full p-1.5 flex items-center justify-center"
                                >
                                    <FilePlus className="w-5 h-5 text-gray-500" />
                                </button>
                            ) : (
                                <button
                                    onClick={() => {
                                        setShowFileUpload(false);
                                    }}
                                    className="hover:bg-gray-100 rounded-full p-1.5 flex items-center justify-center"
                                >
                                    <XCircle className="w-5 h-5 text-gray-500" />
                                </button>
                            )}
                        </div>
                    )}
                    <div className="relative grow flex items-end">
                        <TextareaAutosize
                            typeahead="none"
                            className={classNames(
                                `w-full border-0 outline-none focus:shadow-none [.docked_&]:text-sm focus:ring-0 pt-2 resize-none dark:bg-zinc-100`,
                                enableRag ? "px-1" : "px-3 rounded-s",
                            )}
                            rows={1}
                            disabled={viewingReadOnlyChat}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && !e.shiftKey) {
                                    e.preventDefault();
                                    // Immediately check upload state again to prevent race conditions
                                    if (
                                        isUploadingMedia ||
                                        loading ||
                                        inputValue === "" ||
                                        viewingReadOnlyChat
                                    ) {
                                        // Preventing submission during inappropriate times
                                        return;
                                    }
                                    handleFormSubmit(e);
                                }
                            }}
                            onPaste={async (e) => {
                                const items = e.clipboardData.items;
                                let hasFile = false;
                                let hasText = false;

                                // First check for text content
                                for (let i = 0; i < items.length; i++) {
                                    const item = items[i];
                                    if (
                                        item.kind === "string" &&
                                        (item.type === "text/plain" ||
                                            item.type === "text/html" ||
                                            item.type === "text/rtf")
                                    ) {
                                        hasText = true;
                                        break;
                                    }
                                }

                                // Only check for files if we don't have text
                                if (!hasText) {
                                    for (let i = 0; i < items.length; i++) {
                                        const item = items[i];
                                        if (
                                            item.kind === "file" &&
                                            ACCEPTED_FILE_TYPES.includes(
                                                item.type,
                                            )
                                        ) {
                                            hasFile = true;
                                            const file = item.getAsFile();
                                            if (file) {
                                                if (!showFileUpload) {
                                                    setShowFileUpload(true);
                                                }
                                                const pondFile = {
                                                    source: file,
                                                    options: {
                                                        type: "local",
                                                        file: file,
                                                    },
                                                };
                                                setFiles((prevFiles) => [
                                                    ...prevFiles,
                                                    pondFile,
                                                ]);
                                            }
                                        }
                                    }
                                }

                                // Prevent default only if we handled a file and there's no text
                                if (hasFile && !hasText) {
                                    e.preventDefault();
                                }
                            }}
                            placeholder={placeholder || "Send a message"}
                            value={inputValue}
                            onChange={handleInputChange}
                            autoComplete="on"
                            autoCapitalize="sentences"
                            autoCorrect="on"
                            spellCheck="true"
                            inputMode="text"
                        />
                        <button
                            type={isStreaming || loading ? "button" : "submit"}
                            onClick={
                                isStreaming || loading
                                    ? onStopStreaming
                                    : undefined
                            }
                            disabled={
                                loading ||
                                inputValue === "" ||
                                isUploadingMedia ||
                                viewingReadOnlyChat
                            }
                            className={classNames(
                                "ml-2 pr-4 pb-2.5 text-base rtl:rotate-180 text-emerald-600 hover:text-emerald-600 disabled:text-gray-300 active:text-gray-800 dark:bg-zinc-100 flex items-end",
                            )}
                        >
                            {isStreaming || loading ? (
                                <StopCircle className="w-5 h-5 text-red-500" />
                            ) : (
                                <Send className="w-5 h-5 text-gray-400" />
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

export default MessageInput;
