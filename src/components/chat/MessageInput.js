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
    isRagFileUrl,
    isSupportedFileUrl,
} from "../../utils/mediaUtils";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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
    const MAX_INPUT_LENGTH = 100000;
    const [lengthLimitAlert, setLengthLimitAlert] = useState({
        show: false,
        actualLength: 0,
        source: "", // 'paste' or 'input'
    });

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
            ...(urlsData || [])?.map(
                ({ url, gcs, converted, originalFilename }) => {
                    const obj = {
                        type: "image_url",
                    };

                    obj.gcs = converted?.gcs || gcs;
                    obj.url = converted?.url || url;
                    obj.image_url = { url: converted?.url || url };

                    // Include original filename if available
                    if (originalFilename) {
                        obj.originalFilename = originalFilename;
                    }

                    return JSON.stringify(obj);
                },
            ),
        ];
    };

    const handleInputChange = (event) => {
        const newValue = event.target.value;
        let finalValue = newValue;

        if (newValue.length > MAX_INPUT_LENGTH) {
            setLengthLimitAlert({
                show: true,
                actualLength: newValue.length,
                source: "input",
            });
            finalValue = newValue.substring(0, MAX_INPUT_LENGTH);
        }

        setInputValue(finalValue);

        if (activeChatId) {
            debouncedUpdateUserState((prevState) => ({
                chatInputs: {
                    ...(prevState?.chatInputs || {}),
                    [activeChatId]: finalValue,
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

        // Check if activeChatId is available
        if (!activeChatId) {
            console.warn("Cannot upload file: No active chat ID available");
            return;
        }

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

        //check if url is rag type and process accordingly
        if (isRagFileUrl(url)) {
            fetchData(url);
        } else {
            //media urls, will be sent with active message
            if (isSupportedFileUrl(url)) {
                const currentUrlsData = urlsData;
                const isDuplicate = currentUrlsData.some(
                    (existingUrl) => existingUrl.hash === urlData.hash,
                );
                if (!isDuplicate) {
                    console.log("Adding new URL data:", urlData);
                    setUrlsData((prevUrlsData) => [...prevUrlsData, urlData]);
                } else {
                    console.log(
                        "Skipping duplicate URL with hash:",
                        urlData.hash,
                    );
                }
            } else {
                console.log("URL is not supported:", url);
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
            <div className="rounded-md border border-gray-200 dark:border-gray-600 mt-3">
                <form
                    onSubmit={handleFormSubmit}
                    className="flex items-end rounded-md bg-white dark:bg-gray-800"
                >
                    {enableRag && (
                        <div className="flex items-end px-3 pb-2.5">
                            {!showFileUpload ? (
                                <button
                                    type="button"
                                    data-testid="file-plus-button"
                                    disabled={!activeChatId}
                                    onClick={() => {
                                        if (activeChatId) {
                                            setShowFileUpload(true);
                                        }
                                    }}
                                    className={`rounded-full flex items-center justify-center ${
                                        activeChatId
                                            ? "hover:bg-gray-100 dark:hover:bg-gray-700"
                                            : "cursor-not-allowed opacity-50"
                                    }`}
                                    title={
                                        !activeChatId
                                            ? "File upload requires an active chat"
                                            : "Upload files"
                                    }
                                >
                                    <FilePlus
                                        className={`w-5 h-5 ${activeChatId ? "text-gray-500" : "text-gray-300"}`}
                                    />
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowFileUpload(false);
                                    }}
                                    className="hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full flex items-center justify-center"
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
                                `w-full border-0 outline-none focus:shadow-none [.docked_&]:text-sm focus:ring-0 pt-2 resize-none bg-transparent dark:bg-transparent`,
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
                                const pastedPlainText =
                                    e.clipboardData.getData("text/plain");

                                if (
                                    pastedPlainText &&
                                    pastedPlainText.length > MAX_INPUT_LENGTH
                                ) {
                                    setLengthLimitAlert({
                                        show: true,
                                        actualLength: pastedPlainText.length,
                                        source: "paste",
                                    });
                                    e.preventDefault();
                                    return; // Stop further paste processing
                                }

                                const pastedHtmlContent =
                                    e.clipboardData.getData("text/html");
                                if (
                                    pastedHtmlContent &&
                                    pastedHtmlContent.length > MAX_INPUT_LENGTH
                                ) {
                                    setLengthLimitAlert({
                                        show: true,
                                        actualLength: pastedHtmlContent.length,
                                        source: "paste",
                                    });
                                    e.preventDefault();
                                    return; // Stop further paste processing
                                }

                                const items = e.clipboardData.items;
                                let hasActualFileProcessed = false; // True if a file is successfully added to FilePond
                                let hasPlainText = false;
                                let hasHtmlContent = false;
                                let potentialHtmlImageSrc = null;
                                let fileToProcess = null;

                                // --- Pass 1: Inspect all clipboard items ---
                                const htmlProcessingPromises = [];

                                for (let i = 0; i < items.length; i++) {
                                    const item = items[i];

                                    if (
                                        item.kind === "file" &&
                                        ACCEPTED_FILE_TYPES.includes(item.type)
                                    ) {
                                        if (!fileToProcess) {
                                            // Prioritize the first actual file found
                                            const f = item.getAsFile();
                                            if (f) {
                                                fileToProcess = f;
                                            }
                                        }
                                    } else if (item.kind === "string") {
                                        if (item.type === "text/plain") {
                                            hasPlainText = true;
                                        } else if (item.type === "text/html") {
                                            hasHtmlContent = true;
                                            htmlProcessingPromises.push(
                                                new Promise((resolve) => {
                                                    item.getAsString((html) => {
                                                        let imgSrc = null;
                                                        let textFoundInHtml = false;
                                                        const tempDiv =
                                                            document.createElement(
                                                                "div",
                                                            );
                                                        tempDiv.innerHTML =
                                                            html;
                                                        const images =
                                                            tempDiv.getElementsByTagName(
                                                                "img",
                                                            );
                                                        if (
                                                            images.length > 0 &&
                                                            images[0].src
                                                        ) {
                                                            imgSrc =
                                                                images[0].src;
                                                        }
                                                        // Check for actual text content within HTML too
                                                        if (
                                                            tempDiv.textContent?.trim() !==
                                                            ""
                                                        ) {
                                                            textFoundInHtml = true;
                                                        }
                                                        resolve({
                                                            imgSrc,
                                                            textFoundInHtml,
                                                        });
                                                    });
                                                }),
                                            );
                                        }
                                    }
                                }

                                const htmlResults = await Promise.all(
                                    htmlProcessingPromises,
                                );
                                for (const result of htmlResults) {
                                    if (
                                        result.imgSrc &&
                                        !potentialHtmlImageSrc
                                    ) {
                                        potentialHtmlImageSrc = result.imgSrc;
                                    }
                                    if (result.textFoundInHtml) {
                                        hasPlainText = true;
                                    }
                                }

                                // --- Pass 2: Decide what to do and process ---

                                // Priority 1: Direct File
                                if (fileToProcess && activeChatId) {
                                    if (!showFileUpload) {
                                        setShowFileUpload(true);
                                    }
                                    const pondFile = {
                                        source: fileToProcess,
                                        options: {
                                            type: "local",
                                            file: fileToProcess,
                                        },
                                    };
                                    setFiles((prevFiles) => [
                                        ...prevFiles,
                                        pondFile,
                                    ]);
                                    hasActualFileProcessed = true;
                                }
                                // Priority 2: Image from HTML (if no direct file was processed)
                                else if (
                                    potentialHtmlImageSrc &&
                                    activeChatId
                                ) {
                                    if (
                                        potentialHtmlImageSrc.startsWith(
                                            "data:",
                                        )
                                    ) {
                                        try {
                                            const res = await fetch(
                                                potentialHtmlImageSrc,
                                            );
                                            const blob = await res.blob();
                                            const file = new File(
                                                [blob],
                                                "pasted-image.png",
                                                { type: blob.type },
                                            );
                                            if (!showFileUpload)
                                                setShowFileUpload(true);
                                            setFiles((prevFiles) => [
                                                ...prevFiles,
                                                {
                                                    source: file,
                                                    options: {
                                                        type: "local",
                                                        file: file,
                                                    },
                                                },
                                            ]);
                                            hasActualFileProcessed = true;
                                        } catch (error) {
                                            console.error(
                                                "Error processing data URI from HTML:",
                                                error,
                                            );
                                        }
                                    } else {
                                        // Remote URL
                                        try {
                                            const response = await fetch(
                                                potentialHtmlImageSrc,
                                            );
                                            if (!response.ok)
                                                throw new Error(
                                                    `HTTP error! status: ${response.status}`,
                                                );
                                            const blob = await response.blob();
                                            let filename = "pasted-image";
                                            const subtype =
                                                blob.type.split("/")[1];
                                            if (
                                                subtype &&
                                                /^[a-z0-9]+$/.test(subtype)
                                            )
                                                filename += `.${subtype}`;
                                            else filename += ".png"; // Basic fallback

                                            const file = new File(
                                                [blob],
                                                filename,
                                                { type: blob.type },
                                            );
                                            if (!showFileUpload)
                                                setShowFileUpload(true);
                                            setFiles((prevFiles) => [
                                                ...prevFiles,
                                                {
                                                    source: file,
                                                    options: {
                                                        type: "local",
                                                        file: file,
                                                    },
                                                },
                                            ]);
                                            hasActualFileProcessed = true;
                                        } catch (error) {
                                            console.error(
                                                "Error fetching remote image from HTML src:",
                                                error,
                                            );
                                        }
                                    }
                                }

                                // --- Pass 3: Determine default paste behavior ---
                                if (hasActualFileProcessed && !hasPlainText) {
                                    e.preventDefault();
                                } else if (
                                    hasActualFileProcessed &&
                                    hasPlainText
                                ) {
                                    // File is handled, text will paste by default.
                                } else if (
                                    !hasActualFileProcessed &&
                                    hasPlainText
                                ) {
                                    // Only text, let it paste.
                                } else if (
                                    !hasActualFileProcessed &&
                                    !hasPlainText &&
                                    hasHtmlContent
                                ) {
                                    // This means there was HTML (e.g. just an img tag that might have failed to load, or complex HTML without simple text)
                                    // and no actual file was made from it, and no plain text.
                                    // Prevent pasting potentially broken/unwanted HTML string if we couldn't make a file from it.
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
                                !isStreaming &&
                                !loading &&
                                (loading ||
                                    inputValue === "" ||
                                    isUploadingMedia ||
                                    viewingReadOnlyChat)
                            }
                            className={classNames(
                                "ml-2 px-3 pb-2.5 text-base text-emerald-600 hover:text-emerald-600 disabled:text-gray-300 dark:disabled:text-gray-600 active:text-gray-800 flex items-end",
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
            {lengthLimitAlert.show && (
                <AlertDialog
                    open={lengthLimitAlert.show}
                    onOpenChange={() =>
                        setLengthLimitAlert({
                            show: false,
                            actualLength: 0,
                            source: "",
                        })
                    }
                >
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>
                                Content Too Long
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                                The content has exceeded the maximum allowed
                                length of {MAX_INPUT_LENGTH} characters. Your
                                submission of {lengthLimitAlert.actualLength}{" "}
                                characters&nbsp;
                                {lengthLimitAlert.source === "paste"
                                    ? "was prevented from being pasted."
                                    : "has been truncated."}
                                &nbsp;Please consider uploading it as a file
                                instead.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogAction
                                onClick={() =>
                                    setLengthLimitAlert({
                                        show: false,
                                        actualLength: 0,
                                        source: "",
                                    })
                                }
                            >
                                OK
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            )}
        </div>
    );
}

export default MessageInput;
