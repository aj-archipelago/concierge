import React from "react";
import "highlight.js/styles/github.css";
import dynamic from "next/dynamic";
import { useContext, useEffect, useState, useRef } from "react";
import { Paperclip, XCircle, StopCircle, Send } from "lucide-react";
import TextareaAutosize from "react-textarea-autosize";
import { useTranslation } from "react-i18next";
import { useGetActiveChatId } from "../../../app/queries/chats";
import classNames from "../../../app/utils/class-names";
import { AuthContext } from "../../App";
import {
    ACCEPTED_FILE_TYPES,
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

const DynamicFileUploader = dynamic(() => import("./FileUploader"), {
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
    const { t } = useTranslation();
    const activeChatId = useGetActiveChatId();

    const { userState, debouncedUpdateUserState } = useContext(AuthContext);
    const [isUploadingMedia, setIsUploadingMedia] = useState(false);
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

    // Reset sending lock when loading becomes false (message send completed)
    useEffect(() => {
        if (!loading) {
            isSendingRef.current = false;
        }
    }, [loading]);

    const [inputValue, setInputValue] = useState("");
    const [urlsData, setUrlsData] = useState([]);
    const [files, setFiles] = useState([]);
    const [showFileUpload, setShowFileUpload] = useState(initialShowFileUpload);
    const [isDragging, setIsDragging] = useState(false);
    const isSendingRef = useRef(false);

    const prepareMessage = (inputText) => {
        const textPart = [JSON.stringify({ type: "text", text: inputText })];

        if (!urlsData || urlsData.length === 0) {
            return textPart;
        }

        const fileParts = urlsData.map(
            ({ url, gcs, converted, originalFilename, hash }) => {
                const obj = {
                    type: "image_url",
                };

                const fileUrl = converted?.url || url;

                obj.gcs = converted?.gcs || gcs;
                obj.url = fileUrl;
                obj.image_url = { url: fileUrl };

                // Include original filename if available
                if (originalFilename) {
                    obj.originalFilename = originalFilename;
                }

                // Include hash if available
                if (hash) {
                    obj.hash = hash;
                }

                return JSON.stringify(obj);
            },
        );

        return [...textPart, ...fileParts];
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

    const handleFormSubmit = async (event) => {
        event.preventDefault();
        if (isUploadingMedia) {
            return; // Prevent submission if a file is uploading
        }

        // Prevent duplicate sends - check both loading prop and sending lock ref
        if (isSendingRef.current || loading || !inputValue) {
            return;
        }

        // Set sending lock immediately to prevent race conditions
        isSendingRef.current = true;

        try {
            const message =
                urlsData && urlsData.length > 0
                    ? prepareMessage(inputValue)
                    : [JSON.stringify({ type: "text", text: inputValue })];

            onSend(message);
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
        } catch (error) {
            // If sending fails, reset the lock so user can try again
            isSendingRef.current = false;
            console.error("Error sending message:", error);
        }
    };

    const addUrl = (urlData) => {
        const { url } = urlData;

        // Media urls, will be sent with active message
        if (isSupportedFileUrl(url)) {
            const currentUrlsData = urlsData;
            const isDuplicate = currentUrlsData.some(
                (existingUrl) => existingUrl.hash === urlData.hash,
            );
            if (!isDuplicate) {
                console.log("Adding new URL data:", urlData);
                setUrlsData((prevUrlsData) => [...prevUrlsData, urlData]);
            } else {
                console.log("Skipping duplicate URL with hash:", urlData.hash);
            }
        } else {
            console.log("URL is not supported:", url);
        }
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!viewingReadOnlyChat && activeChatId) {
            setIsDragging(true);
        }
    };

    const handleDragLeave = (e) => {
        e.preventDefault();
        e.stopPropagation();
        // Only set dragging to false if we're actually leaving the component
        // Check if we're moving to a child element
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX;
        const y = e.clientY;
        if (
            x < rect.left ||
            x > rect.right ||
            y < rect.top ||
            y > rect.bottom
        ) {
            setIsDragging(false);
        }
    };

    const handleDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);

        if (viewingReadOnlyChat || !activeChatId) {
            return;
        }

        const droppedFiles = Array.from(e.dataTransfer.files);
        if (droppedFiles.length === 0) {
            return;
        }

        // Filter to only accepted file types
        const validFiles = droppedFiles.filter((file) =>
            ACCEPTED_FILE_TYPES.includes(file.type),
        );

        if (validFiles.length === 0) {
            return;
        }

        // Show file uploader if not already shown
        if (!showFileUpload) {
            setShowFileUpload(true);
        }

        // Add files to the uploader
        const newFiles = validFiles.map((file) => ({
            id: `file-${Date.now()}-${Math.random()}`,
            source: file,
            file: file,
            filename: file.name,
            name: file.name,
            type: file.type,
            size: file.size,
            status: "pending",
            progress: 0,
        }));

        setFiles((prevFiles) => [...prevFiles, ...newFiles]);
    };

    return (
        <div>
            <div
                className={classNames(
                    "rounded-md border-2 mt-1",
                    isDragging
                        ? "border-sky-500 border-dashed bg-sky-50 dark:bg-sky-900/20"
                        : "border-gray-300 dark:border-gray-500",
                    "bg-white dark:bg-gray-800",
                    showFileUpload && "overflow-hidden",
                )}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
            >
                {showFileUpload && (
                    <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-600 pt-2">
                        <DynamicFileUploader
                            addUrl={addUrl}
                            files={files}
                            setFiles={setFiles}
                            setIsUploadingMedia={setIsUploadingMedia}
                            setUrlsData={setUrlsData}
                        />
                    </div>
                )}
                <form
                    onSubmit={handleFormSubmit}
                    className={classNames(
                        "flex items-end rounded-md",
                        showFileUpload && "pt-2",
                    )}
                >
                    {enableRag && (
                        <div className="flex items-end px-3 pb-2.5">
                            {!showFileUpload ? (
                                <button
                                    type="button"
                                    data-testid="file-plus-button"
                                    disabled={
                                        !activeChatId || viewingReadOnlyChat
                                    }
                                    onClick={() => {
                                        if (
                                            activeChatId &&
                                            !viewingReadOnlyChat
                                        ) {
                                            setShowFileUpload(true);
                                        }
                                    }}
                                    className={`rounded-full flex items-center justify-center ${
                                        activeChatId && !viewingReadOnlyChat
                                            ? "hover:bg-gray-100 dark:hover:bg-gray-700"
                                            : "cursor-not-allowed opacity-50"
                                    }`}
                                    title={
                                        viewingReadOnlyChat
                                            ? t("Read-only mode")
                                            : !activeChatId
                                              ? t(
                                                    "File upload requires an active chat",
                                                )
                                              : t("Upload files")
                                    }
                                >
                                    <Paperclip
                                        className={`w-5 h-5 ${
                                            activeChatId && !viewingReadOnlyChat
                                                ? "text-gray-500"
                                                : "text-gray-400"
                                        }`}
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
                                `w-full border-0 outline-none focus:shadow-none text-base md:text-sm [.docked_&]:md:text-sm focus:ring-0 pt-2 resize-none bg-transparent dark:bg-transparent`,
                                enableRag ? "px-1" : "px-3 rounded-s",
                                viewingReadOnlyChat
                                    ? "text-gray-400 dark:text-gray-400 cursor-not-allowed placeholder:text-gray-400 dark:placeholder:text-gray-400"
                                    : "",
                            )}
                            rows={1}
                            disabled={viewingReadOnlyChat}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && !e.shiftKey) {
                                    e.preventDefault();
                                    // Immediately check upload state and sending lock to prevent race conditions
                                    if (
                                        isUploadingMedia ||
                                        isSendingRef.current ||
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
                                if (pastedHtmlContent) {
                                    // Extract actual text content from HTML to check length
                                    const tempDiv =
                                        document.createElement("div");
                                    tempDiv.innerHTML = pastedHtmlContent;
                                    const htmlTextContent =
                                        tempDiv.textContent ||
                                        tempDiv.innerText ||
                                        "";

                                    if (
                                        htmlTextContent.length >
                                        MAX_INPUT_LENGTH
                                    ) {
                                        setLengthLimitAlert({
                                            show: true,
                                            actualLength:
                                                htmlTextContent.length,
                                            source: "paste",
                                        });
                                        e.preventDefault();
                                        return; // Stop further paste processing
                                    }
                                }

                                const items = e.clipboardData.items;
                                let hasActualFileProcessed = false; // True if a file is successfully added to FileUploader
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
                                    const uploadFile = {
                                        id: `file-${Date.now()}-${Math.random()}`,
                                        source: fileToProcess,
                                        file: fileToProcess,
                                        filename: fileToProcess.name,
                                        name: fileToProcess.name,
                                        type: fileToProcess.type,
                                        size: fileToProcess.size,
                                        status: "pending",
                                        progress: 0,
                                    };
                                    setFiles((prevFiles) => [
                                        ...prevFiles,
                                        uploadFile,
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
                                                    id: `file-${Date.now()}-${Math.random()}`,
                                                    source: file,
                                                    file: file,
                                                    filename: file.name,
                                                    name: file.name,
                                                    type: file.type,
                                                    size: file.size,
                                                    status: "pending",
                                                    progress: 0,
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
                                                    id: `file-${Date.now()}-${Math.random()}`,
                                                    source: file,
                                                    file: file,
                                                    filename: file.name,
                                                    name: file.name,
                                                    type: file.type,
                                                    size: file.size,
                                                    status: "pending",
                                                    progress: 0,
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
                                (inputValue === "" ||
                                    isUploadingMedia ||
                                    viewingReadOnlyChat)
                            }
                            className={classNames(
                                "ml-2 px-3 pb-2.5 text-base text-emerald-600 hover:text-emerald-600 disabled:text-gray-400 dark:disabled:text-gray-400 active:text-gray-800 flex items-end disabled:cursor-not-allowed",
                            )}
                        >
                            {isStreaming || loading ? (
                                <StopCircle className="w-5 h-5 text-red-500" />
                            ) : (
                                <span className="rtl:scale-x-[-1]">
                                    <Send
                                        className={`w-5 h-5 ${
                                            inputValue === "" ||
                                            isUploadingMedia ||
                                            viewingReadOnlyChat
                                                ? "text-gray-400"
                                                : "text-emerald-600"
                                        }`}
                                    />
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
