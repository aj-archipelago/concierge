import React from "react";
import { useApolloClient } from "@apollo/client";
import "highlight.js/styles/github.css";
import dynamic from "next/dynamic";
import { useContext, useEffect, useState } from "react";
import { FaFileCirclePlus } from "react-icons/fa6";
import { IoCloseCircle, IoStopCircle } from "react-icons/io5";
import { RiSendPlane2Fill } from "react-icons/ri";
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
                    className="flex items-center rounded-md dark:bg-zinc-100"
                >
                    {enableRag && (
                        <div className="rounded-s pt-4 [.docked_&]:pt-3.5 ps-4 pe-3 dark:bg-zinc-100 self-stretch flex">
                            {!showFileUpload ? (
                                <FaFileCirclePlus
                                    onClick={() => {
                                        setShowFileUpload(true);
                                    }}
                                    className="text-gray-500 group flex items-center text-base font-medium hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/75 cursor-pointer"
                                    role="button"
                                    aria-label="file upload"
                                    data-testid="file-upload-button"
                                />
                            ) : (
                                <IoCloseCircle
                                    onClick={() => {
                                        setShowFileUpload(false);
                                    }}
                                    className="text-gray-500 group flex items-center text-base font-medium hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/75 cursor-pointer"
                                    role="button"
                                    aria-label="close"
                                    data-testid="close-button"
                                />
                            )}
                        </div>
                    )}
                    <div className="relative grow">
                        <div className="flex items-center">
                            <TextareaAutosize
                                typeahead="none"
                                className={classNames(
                                    `w-full border-0 outline-none focus:shadow-none [.docked_&]:text-sm focus:ring-0 py-3 resize-none dark:bg-zinc-100`,
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
                        </div>
                    </div>
                    <div className=" pe-4 ps-3 dark:bg-zinc-100 self-stretch flex rounded-e">
                        <div className="pt-4">
                            {isStreaming || loading ? (
                                <button
                                    type="button"
                                    onClick={onStopStreaming}
                                    className={classNames(
                                        "text-base text-red-600 hover:text-red-700 active:text-red-800 dark:bg-zinc-100",
                                    )}
                                >
                                    <IoStopCircle />
                                </button>
                            ) : (
                                <button
                                    type="submit"
                                    disabled={
                                        loading ||
                                        inputValue === "" ||
                                        isUploadingMedia ||
                                        viewingReadOnlyChat
                                    }
                                    className={classNames(
                                        "text-base rtl:rotate-180 text-emerald-600 hover:text-emerald-600 disabled:text-gray-300 active:text-gray-800 dark:bg-zinc-100",
                                    )}
                                >
                                    <RiSendPlane2Fill />
                                </button>
                            )}
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
}

export default MessageInput;
