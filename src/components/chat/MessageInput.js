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
                        <div className="flex items-end px-3 pb-2.5">
                            {!showFileUpload ? (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowFileUpload(true);
                                    }}
                                    className="hover:bg-gray-100 rounded-full flex items-center justify-center"
                                >
                                    <FilePlus className="w-5 h-5 text-gray-500" />
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowFileUpload(false);
                                    }}
                                    className="hover:bg-gray-100 rounded-full flex items-center justify-center"
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
                                console.log("=== Paste Event Debug ===");
                                console.log("Clipboard Data:", e.clipboardData);
                                console.log(
                                    "Clipboard Items:",
                                    e.clipboardData.items,
                                );

                                const items = e.clipboardData.items;
                                let hasFile = false;
                                let hasText = false;
                                let hasImageInHtml = false;

                                // Process HTML content first
                                const processHtmlContent = async (item) => {
                                    return new Promise((resolve) => {
                                        item.getAsString(async (html) => {
                                            console.log("HTML content:", html);
                                            const tempDiv =
                                                document.createElement("div");
                                            tempDiv.innerHTML = html;
                                            const images =
                                                tempDiv.getElementsByTagName(
                                                    "img",
                                                );

                                            if (images.length > 0) {
                                                console.log(
                                                    "Found image in HTML:",
                                                    images[0].src,
                                                );
                                                hasImageInHtml = true;

                                                if (
                                                    images[0].src.startsWith(
                                                        "data:",
                                                    )
                                                ) {
                                                    const dataUrl =
                                                        images[0].src;
                                                    const res =
                                                        await fetch(dataUrl);
                                                    const blob =
                                                        await res.blob();
                                                    const file = new File(
                                                        [blob],
                                                        "pasted-image.png",
                                                        { type: blob.type },
                                                    );

                                                    if (!showFileUpload) {
                                                        console.log(
                                                            "Showing file upload UI",
                                                        );
                                                        setShowFileUpload(true);
                                                    }

                                                    const pondFile = {
                                                        source: file,
                                                        options: {
                                                            type: "local",
                                                            file: file,
                                                        },
                                                    };
                                                    console.log(
                                                        "Adding file to FilePond:",
                                                        pondFile,
                                                    );
                                                    setFiles((prevFiles) => [
                                                        ...prevFiles,
                                                        pondFile,
                                                    ]);
                                                    hasFile = true;
                                                }
                                            }
                                            resolve();
                                        });
                                    });
                                };

                                // Process all items
                                for (let i = 0; i < items.length; i++) {
                                    const item = items[i];
                                    console.log(`Item ${i}:`, {
                                        kind: item.kind,
                                        type: item.type,
                                    });

                                    if (item.kind === "string") {
                                        if (item.type === "text/html") {
                                            await processHtmlContent(item);
                                        } else if (
                                            item.type === "text/plain" ||
                                            item.type === "text/rtf"
                                        ) {
                                            hasText = true;
                                            console.log(
                                                "Found text content:",
                                                item.type,
                                            );
                                        }
                                    }
                                }

                                console.log("Has text:", hasText);
                                console.log(
                                    "Has image in HTML:",
                                    hasImageInHtml,
                                );

                                // Only check for files if we don't have text or HTML images
                                if (!hasText && !hasImageInHtml) {
                                    console.log("Checking for files...");
                                    for (let i = 0; i < items.length; i++) {
                                        const item = items[i];
                                        console.log(`File item ${i}:`, {
                                            kind: item.kind,
                                            type: item.type,
                                            isAccepted:
                                                ACCEPTED_FILE_TYPES.includes(
                                                    item.type,
                                                ),
                                        });

                                        if (
                                            item.kind === "file" &&
                                            ACCEPTED_FILE_TYPES.includes(
                                                item.type,
                                            )
                                        ) {
                                            hasFile = true;
                                            const file = item.getAsFile();
                                            console.log("File details:", {
                                                name: file?.name,
                                                type: file?.type,
                                                size: file?.size,
                                            });

                                            if (file) {
                                                if (!showFileUpload) {
                                                    console.log(
                                                        "Showing file upload UI",
                                                    );
                                                    setShowFileUpload(true);
                                                }
                                                const pondFile = {
                                                    source: file,
                                                    options: {
                                                        type: "local",
                                                        file: file,
                                                    },
                                                };
                                                console.log(
                                                    "Adding file to FilePond:",
                                                    pondFile,
                                                );
                                                setFiles((prevFiles) => [
                                                    ...prevFiles,
                                                    pondFile,
                                                ]);
                                            }
                                        }
                                    }
                                }
                                console.log("Has file:", hasFile);

                                // Handle mixed content
                                if (hasText && hasImageInHtml) {
                                    console.log(
                                        "Mixed content detected - handling both text and image",
                                    );
                                    // Allow the text to be pasted normally
                                    // The image will be handled by the async callback above
                                }

                                // Prevent default if we have a file or an image in HTML (and no text)
                                if ((hasFile || hasImageInHtml) && !hasText) {
                                    console.log(
                                        "Preventing default paste behavior",
                                    );
                                    e.preventDefault();
                                } else {
                                    console.log(
                                        "Allowing default paste behavior",
                                    );
                                }
                                console.log("=== End Paste Event Debug ===");
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
                                !isStreaming &&
                                !loading &&
                                (loading ||
                                    inputValue === "" ||
                                    isUploadingMedia ||
                                    viewingReadOnlyChat)
                            }
                            className={classNames(
                                "ml-2 px-3 pb-2.5 text-base text-emerald-600 hover:text-emerald-600 disabled:text-gray-300 active:text-gray-800 dark:bg-zinc-100 flex items-end",
                            )}
                        >
                            {isStreaming || loading ? (
                                <StopCircle className="w-5 h-5 text-red-500" />
                            ) : (
                                <span className="rtl:scale-x-[-1]">
                                    <Send className="w-5 h-5 text-gray-400" />
                                </span>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

export default MessageInput;
