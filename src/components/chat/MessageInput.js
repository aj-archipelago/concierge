import React from "react";
import "highlight.js/styles/github.css";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import { usePortal } from "../../contexts/PortalContext";
import {
    Paperclip,
    XCircle,
    StopCircle,
    Send,
    Mic,
    MicOff,
} from "lucide-react";
import TextareaAutosize from "react-textarea-autosize";
import { useTranslation } from "react-i18next";
import { useGetActiveChatId } from "../../../app/queries/chats";
import classNames from "../../../app/utils/class-names";
import {
    isSupportedFileUrl,
    isImageUrl,
    generateFilenameFromMimeType,
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
import SlashCommandMenu from "./SlashCommandMenu";

const DynamicFileUploader = dynamic(() => import("./FileUploader"), {
    ssr: false,
});

const CHAT_INPUT_STORAGE_KEY = "chat_input_drafts_v1";

function readStoredDraft(chatId) {
    if (!chatId || typeof window === "undefined") return "";

    try {
        const stored = window.localStorage.getItem(CHAT_INPUT_STORAGE_KEY);
        if (!stored) return "";
        const drafts = JSON.parse(stored);
        return drafts?.[chatId] || "";
    } catch {
        return "";
    }
}

function writeStoredDraft(chatId, value) {
    if (!chatId || typeof window === "undefined") return;

    try {
        const stored = window.localStorage.getItem(CHAT_INPUT_STORAGE_KEY);
        const drafts = stored ? JSON.parse(stored) : {};

        if (value) {
            drafts[chatId] = value;
        } else {
            delete drafts[chatId];
        }

        if (Object.keys(drafts).length === 0) {
            window.localStorage.removeItem(CHAT_INPUT_STORAGE_KEY);
        } else {
            window.localStorage.setItem(
                CHAT_INPUT_STORAGE_KEY,
                JSON.stringify(drafts),
            );
        }
    } catch {
        // Ignore storage failures; draft persistence is best-effort.
    }
}

// Displays the list of messages and a message input box.
const MessageInput = React.memo(
    React.forwardRef(function MessageInput(
        {
            onSend,
            loading,
            sendBlocked = false,
            enableRag,
            placeholder,
            viewingReadOnlyChat,
            isStreaming,
            onStopStreaming,
            onInjectMessage,
            initialShowFileUpload = false,
            chatId: chatIdProp,
            onPromoteChat,
        },
        ref,
    ) {
        const { t, i18n } = useTranslation();
        const queryChatId = useGetActiveChatId();
        // Prefer the prop (available immediately) over the async query
        // to avoid a race condition where the query resolves after the
        // user has already started typing, wiping their input.
        const activeChatId = chatIdProp || queryChatId;
        const textareaRef = useRef(null);
        const requestFocus = React.useCallback(() => {
            if (!textareaRef.current) return;
            requestAnimationFrame(() => {
                textareaRef.current?.focus();
            });
        }, []);

        // Expose focus method to parent via ref
        React.useImperativeHandle(
            ref,
            () => ({
                focus: () => {
                    if (textareaRef.current) {
                        textareaRef.current.focus();
                    }
                },
            }),
            [],
        );

        const [isUploadingMedia, setIsUploadingMedia] = useState(false);
        const MAX_INPUT_LENGTH = 100000;
        const [inputValue, setInputValue] = useState("");
        const [isListening, setIsListening] = useState(false);
        const recognitionRef = useRef(null);
        const baseRef = useRef("");
        const chatIdRef = useRef(activeChatId);
        chatIdRef.current = activeChatId;
        const inputRef = useRef(inputValue);
        inputRef.current = inputValue;
        const hasSpeechRecognition =
            typeof window !== "undefined" &&
            !!(window.SpeechRecognition || window.webkitSpeechRecognition);
        const [initializedForChat, setInitializedForChat] = useState(null);
        const prevChatIdRef = useRef(null);
        const isPromotionRef = useRef(false);
        const [lengthLimitAlert, setLengthLimitAlert] = useState({
            show: false,
            actualLength: 0,
            source: "", // 'paste' or 'input'
        });
        const { openPortal } = usePortal();
        const router = useRouter();

        // Listen for chat promotion (new → real ID) so we can preserve
        // the current input instead of wiping it with an empty draft.
        useEffect(() => {
            const onPromotion = () => {
                isPromotionRef.current = true;
            };
            window.addEventListener("chatIdUpdate", onPromotion);
            return () =>
                window.removeEventListener("chatIdUpdate", onPromotion);
        }, []);

        // Reset initialization when chat changes to a different chat
        useEffect(() => {
            if (activeChatId !== prevChatIdRef.current) {
                if (prevChatIdRef.current !== null) {
                    setInitializedForChat(null);
                }
                prevChatIdRef.current = activeChatId;
            }
        }, [activeChatId]);

        useEffect(() => {
            if (!activeChatId) {
                setInputValue("");
                setInitializedForChat(null);
                return;
            }
            if (initializedForChat === activeChatId) return;

            if (isPromotionRef.current) {
                // Promotion: keep current input, just update the draft key
                isPromotionRef.current = false;
                setInitializedForChat(activeChatId);
                return;
            }

            setInputValue(readStoredDraft(activeChatId));
            setInitializedForChat(activeChatId);
        }, [activeChatId, initializedForChat]);

        useEffect(() => {
            if (typeof window === "undefined") return;
            const requestedAt = window.__chatFocusRequest;
            if (
                typeof requestedAt === "number" &&
                Date.now() - requestedAt < 3000
            ) {
                window.__chatFocusRequest = null;
                requestFocus();
            }
        }, [activeChatId, requestFocus]);

        // Cleanup speech recognition on unmount
        useEffect(() => {
            return () => {
                const rec = recognitionRef.current;
                if (rec) {
                    recognitionRef.current = null;
                    rec.onend = null;
                    rec.onerror = null;
                    rec.onresult = null;
                    rec.abort();
                }
            };
        }, []);

        // Stop mic if chat becomes read-only
        useEffect(() => {
            if (!viewingReadOnlyChat || !recognitionRef.current) {
                return;
            }

            const rec = recognitionRef.current;
            recognitionRef.current = null;
            rec.onend = null;
            rec.onerror = null;
            rec.onresult = null;
            rec.abort();
            setIsListening(false);
        }, [viewingReadOnlyChat]);

        // Reset sending lock when loading becomes false (message send completed)
        useEffect(() => {
            if (!loading) {
                isSendingRef.current = false;
            }
        }, [loading]);

        const [urlsData, setUrlsData] = useState([]);
        const [files, setFiles] = useState([]);
        const [showFileUpload, setShowFileUpload] = useState(
            initialShowFileUpload,
        );
        const [isDragging, setIsDragging] = useState(false);
        const isSendingRef = useRef(false);

        const prepareMessage = (inputText) => {
            const textPart = [
                JSON.stringify({ type: "text", text: inputText }),
            ];

            if (!urlsData || urlsData.length === 0) {
                return textPart;
            }

            const fileParts = urlsData.map(
                ({
                    url,
                    converted,
                    displayFilename,
                    hash,
                    blobPath,
                    mimeType,
                }) => {
                    const fileUrl = converted?.url || url;
                    const fileBlobPath = converted?.blobPath || blobPath;
                    const isImageAttachment =
                        (mimeType && mimeType.startsWith("image/")) ||
                        isImageUrl(displayFilename || fileUrl);
                    const obj = {
                        type: isImageAttachment ? "image_url" : "file",
                    };

                    obj.url = fileUrl;
                    if (isImageAttachment) {
                        obj.image_url = { url: fileUrl };
                    } else {
                        obj.file = fileUrl;
                    }

                    // Include hash if available
                    if (hash) {
                        obj.hash = hash;
                    }

                    if (fileBlobPath) {
                        obj.blobPath = fileBlobPath;
                    }

                    // Note: displayFilename is NOT included in payload sent to server
                    // It will be stored locally in the message object for display purposes
                    // For backward compatibility, we include it in the payload for now
                    // but the server will ignore it
                    if (displayFilename) {
                        obj.displayFilename = displayFilename;
                    }
                    if (mimeType) {
                        obj.mimeType = mimeType;
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
            writeStoredDraft(activeChatId, finalValue);

            // User edited while mic is on — restart recognition with new base
            if (recognitionRef.current) {
                baseRef.current = finalValue;
                detachRec(recognitionRef.current);
                recognitionRef.current?.abort();
                recognitionRef.current = null;
                startMic();
            }
        };

        const detachRec = (rec) => {
            if (!rec) return;
            rec.onend = null;
            rec.onerror = null;
            rec.onresult = null;
        };

        const stopMic = () => {
            const rec = recognitionRef.current;
            recognitionRef.current = null;
            detachRec(rec);
            rec?.abort();
            setIsListening(false);
        };

        const startMic = () => {
            const SR =
                window.SpeechRecognition || window.webkitSpeechRecognition;
            if (!SR) return;
            // Detach old instance so its callbacks become no-ops
            detachRec(recognitionRef.current);
            recognitionRef.current = null;

            const rec = new SR();
            rec.continuous = true;
            rec.interimResults = true;
            rec.lang = i18n.language === "ar" ? "ar-SA" : "en-US";
            rec.onresult = (e) => {
                let final = "",
                    interim = "";
                for (let i = 0; i < e.results.length; i++) {
                    const t = e.results[i][0].transcript;
                    if (e.results[i].isFinal) final += t;
                    else interim += t;
                }
                const val = (baseRef.current + " " + final + interim).trim();
                setInputValue(val);
                writeStoredDraft(chatIdRef.current, val);
            };
            rec.onend = () => {
                if (recognitionRef.current === rec) {
                    baseRef.current = inputRef.current;
                    startMic();
                }
            };
            rec.onerror = (e) => {
                if (e.error === "no-speech" || e.error === "aborted") return;
                if (recognitionRef.current === rec) stopMic();
            };
            recognitionRef.current = rec;
            try {
                rec.start();
                setIsListening(true);
            } catch {
                detachRec(rec);
                recognitionRef.current = null;
                setIsListening(false);
            }
        };

        const handleFormSubmit = async (event) => {
            event.preventDefault();
            if (isUploadingMedia) {
                return; // Prevent submission if a file is uploading
            }

            // Prevent duplicate sends - check both loading prop and sending lock ref
            if (isSendingRef.current || loading || sendBlocked || !inputValue) {
                return;
            }

            const wasMicOn = isListening;
            if (wasMicOn) stopMic();

            // Set sending lock immediately to prevent race conditions
            isSendingRef.current = true;

            try {
                const message =
                    urlsData && urlsData.length > 0
                        ? prepareMessage(inputValue)
                        : [JSON.stringify({ type: "text", text: inputValue })];

                if (typeof window !== "undefined") {
                    window.__chatFocusRequest = Date.now();
                }
                onSend(message);
                setInputValue("");
                setFiles([]);
                setUrlsData([]);
                setShowFileUpload(false);
                // Keep focus in the input for keyboard-first flow
                requestFocus();
                writeStoredDraft(activeChatId, "");
                // Restart mic if it was on before send
                if (wasMicOn) {
                    baseRef.current = "";
                    startMic();
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
                    console.log(
                        "Skipping duplicate URL with hash:",
                        urlData.hash,
                    );
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

            // Show file uploader if not already shown
            if (!showFileUpload) {
                setShowFileUpload(true);
            }

            // Add files to the uploader
            const newFiles = droppedFiles.map((file) => ({
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
                                chatId={activeChatId}
                                promoteChat={onPromoteChat}
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
                                                activeChatId &&
                                                !viewingReadOnlyChat
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
                            <SlashCommandMenu
                                visible={
                                    inputValue.startsWith("/") &&
                                    !viewingReadOnlyChat
                                }
                                filter={
                                    inputValue.startsWith("/")
                                        ? inputValue.slice(1)
                                        : ""
                                }
                                onSelect={(cmdId) => {
                                    if (cmdId === "connectors") {
                                        openPortal(
                                            "capabilities",
                                            "connectors",
                                        );
                                    } else if (cmdId === "skills") {
                                        openPortal("capabilities", "skills");
                                    } else if (cmdId === "automations") {
                                        router.push("/automations");
                                    } else if (cmdId === "settings") {
                                        openPortal("discover");
                                    }
                                    setInputValue("");
                                    writeStoredDraft(activeChatId, "");
                                }}
                                onClose={() => {
                                    const nextValue = inputValue.slice(1) || "";
                                    setInputValue(nextValue);
                                    writeStoredDraft(activeChatId, nextValue);
                                }}
                            />
                            <TextareaAutosize
                                data-testid="chat-message-input"
                                ref={textareaRef}
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
                                    if (e.key === "Escape" && isListening) {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        stopMic();
                                        return;
                                    }
                                    if (e.key === "Enter" && !e.shiftKey) {
                                        // Let SlashCommandMenu handle Enter when it's visible
                                        if (inputValue.startsWith("/")) {
                                            return;
                                        }
                                        e.preventDefault();

                                        if (
                                            viewingReadOnlyChat ||
                                            sendBlocked ||
                                            inputValue === ""
                                        )
                                            return;

                                        // While streaming, inject the message into the running agent loop
                                        if (
                                            (isStreaming || loading) &&
                                            inputValue &&
                                            onInjectMessage
                                        ) {
                                            const wasMicOn = isListening;
                                            if (wasMicOn) stopMic();
                                            onInjectMessage(inputValue);
                                            setInputValue("");
                                            writeStoredDraft(activeChatId, "");
                                            requestFocus();
                                            if (wasMicOn) {
                                                baseRef.current = "";
                                                startMic();
                                            }
                                            return;
                                        }

                                        // Immediately check upload state and sending lock to prevent race conditions
                                        if (
                                            isUploadingMedia ||
                                            isSendingRef.current ||
                                            sendBlocked ||
                                            loading
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
                                        pastedPlainText.length >
                                            MAX_INPUT_LENGTH
                                    ) {
                                        setLengthLimitAlert({
                                            show: true,
                                            actualLength:
                                                pastedPlainText.length,
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

                                        if (item.kind === "file") {
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
                                            } else if (
                                                item.type === "text/html"
                                            ) {
                                                hasHtmlContent = true;
                                                htmlProcessingPromises.push(
                                                    new Promise((resolve) => {
                                                        item.getAsString(
                                                            (html) => {
                                                                let imgSrc =
                                                                    null;
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
                                                                    images.length >
                                                                        0 &&
                                                                    images[0]
                                                                        .src
                                                                ) {
                                                                    imgSrc =
                                                                        images[0]
                                                                            .src;
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
                                                            },
                                                        );
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
                                            potentialHtmlImageSrc =
                                                result.imgSrc;
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

                                        // Always run through generateFilenameFromMimeType: it
                                        // passes real filenames through unchanged but uniquifies
                                        // generic clipboard names like "image.png" (which mobile
                                        // pastes use) so they don't collide across chats.
                                        let fileWithName = fileToProcess;
                                        let filename =
                                            generateFilenameFromMimeType(
                                                fileToProcess,
                                            );

                                        if (filename !== fileToProcess.name) {
                                            fileWithName = new File(
                                                [fileToProcess],
                                                filename,
                                                { type: fileToProcess.type },
                                            );
                                        }

                                        const uploadFile = {
                                            id: `file-${Date.now()}-${Math.random()}`,
                                            source: fileWithName,
                                            file: fileWithName,
                                            filename: filename,
                                            name: filename,
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
                                                const filename =
                                                    generateFilenameFromMimeType(
                                                        {
                                                            name: "",
                                                            type: blob.type,
                                                        },
                                                    );
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
                                                const blob =
                                                    await response.blob();
                                                const filename =
                                                    generateFilenameFromMimeType(
                                                        {
                                                            name: "",
                                                            type: blob.type,
                                                        },
                                                    );

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
                                    if (
                                        hasActualFileProcessed &&
                                        !hasPlainText
                                    ) {
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
                            {hasSpeechRecognition && !viewingReadOnlyChat && (
                                <button
                                    type="button"
                                    tabIndex={-1}
                                    onClick={() => {
                                        if (isListening) {
                                            stopMic();
                                        } else {
                                            baseRef.current = inputValue;
                                            startMic();
                                        }
                                        requestFocus();
                                    }}
                                    className="ps-1 pe-0 pb-2.5 text-base flex items-end"
                                    title={
                                        isListening
                                            ? t("Stop recording")
                                            : t("Voice input")
                                    }
                                >
                                    {isListening ? (
                                        <MicOff className="w-5 h-5 text-red-500 animate-pulse" />
                                    ) : (
                                        <Mic className="w-5 h-5 text-gray-400 hover:text-emerald-600" />
                                    )}
                                </button>
                            )}
                            <button
                                data-testid="chat-send-button"
                                type={
                                    isStreaming || loading ? "button" : "submit"
                                }
                                onClick={
                                    isStreaming || loading
                                        ? inputValue && onInjectMessage
                                            ? () => {
                                                  const wasMicOn = isListening;
                                                  if (wasMicOn) stopMic();
                                                  onInjectMessage(inputValue);
                                                  setInputValue("");
                                                  writeStoredDraft(
                                                      activeChatId,
                                                      "",
                                                  );
                                                  requestFocus();
                                                  if (wasMicOn) {
                                                      baseRef.current = "";
                                                      startMic();
                                                  }
                                              }
                                            : onStopStreaming
                                        : undefined
                                }
                                disabled={
                                    viewingReadOnlyChat ||
                                    (!isStreaming && !loading && sendBlocked) ||
                                    (!isStreaming &&
                                        !loading &&
                                        (inputValue === "" || isUploadingMedia))
                                }
                                className={classNames(
                                    "ms-2 px-2 pb-2.5 text-base text-emerald-600 hover:text-emerald-600 disabled:text-gray-400 dark:disabled:text-gray-400 active:text-gray-800 flex items-end disabled:cursor-not-allowed",
                                )}
                            >
                                {isStreaming || loading ? (
                                    inputValue && onInjectMessage ? (
                                        <span className="rtl:scale-x-[-1]">
                                            <Send className="w-5 h-5 text-emerald-600" />
                                        </span>
                                    ) : (
                                        <StopCircle className="w-5 h-5 text-red-500" />
                                    )
                                ) : (
                                    <span className="rtl:scale-x-[-1]">
                                        <Send
                                            className={`w-5 h-5 ${
                                                inputValue === "" ||
                                                isUploadingMedia ||
                                                viewingReadOnlyChat ||
                                                sendBlocked
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
                                    {t("Content Too Long")}
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                    {t(
                                        lengthLimitAlert.source === "paste"
                                            ? "content_too_long_paste"
                                            : "content_too_long_truncated",
                                        {
                                            max: MAX_INPUT_LENGTH,
                                            actual: lengthLimitAlert.actualLength,
                                        },
                                    )}
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
                                    {t("OK")}
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                )}
            </div>
        );
    }),
);

export default MessageInput;
