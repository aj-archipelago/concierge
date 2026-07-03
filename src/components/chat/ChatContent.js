"use client";

import React, {
    useCallback,
    useContext,
    useMemo,
    useEffect,
    useRef,
    useState,
} from "react";
import { useApolloClient } from "@apollo/client";

import { useTranslation } from "react-i18next";
import { toast } from "react-toastify";
import { CurrentUserContext, ServerContext } from "../../App.js";
import { useStableCallback } from "../../hooks/useStableCallback";
import ChatMessages from "./ChatMessages";
import MessageInput from "./MessageInput";
import { QUERIES } from "../../graphql";
import {
    useUpdateChat,
    useAddMessage,
    ensureChatInActiveChats,
    getMessageSignature,
    mergeFetchedChatResponse,
    normalizeChatForCache,
    syncInFlightChatCache,
    syncChatToListCaches,
} from "../../../app/queries/chats";
import { DEFAULT_CHAT_MESSAGES_LIMIT } from "../../../app/constants/chats";
import {
    createFilePlaceholder,
    resolveFileReference,
} from "../../../app/workspaces/[id]/components/chatFileUtils";
import { useStreamingMessages } from "../../hooks/useStreamingMessages";
import { useQueryClient } from "@tanstack/react-query";
import axios from "../../../app/utils/axios-client";
import { useRouter, usePathname } from "next/navigation";
import { useDispatch, useSelector, useStore } from "react-redux";
import {
    updateCanvasTab,
    updateCanvasTabForChat,
} from "../../stores/chatSlice";
import { composeUserDateTimeInfo } from "../../utils/datetimeUtils";
import {
    CLIENT_SIDE_TOOLS,
    CLIENT_SIDE_TOOL_HANDLERS,
    filterToolsByRoute,
    getClientSideToolFocusError,
} from "../../utils/clientSideTools";
import {
    buildRelevantSkillReferenceContext,
    getLoadSkillTool,
} from "../../utils/skills";
import { applyBilingualClientSideTools } from "../../utils/applyBilingualClientSideTools";
import { useSkills } from "../../hooks/useSkills";
import { usePageContext } from "../../contexts/PageContextProvider";
import { combineContexts } from "../../utils/globalContext";
import { MUTATIONS } from "../../graphql";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { createQueuedConfirmationHandler } from "../../../app/chat/toolInteraction";
import {
    buildModelPayloadFromStoredPayload,
    extractPreviewTextFromStoredPayload,
    createAssistantTextItem,
    createAssistantToolEventItem,
    serializeAssistantPayloadItem,
} from "../../utils/assistantInlinePayload";
import { useResolvedAgentModel } from "../../hooks/useResolvedAgentModel";
import { buildHtmlWorkspaceRefreshContent } from "../../utils/canvasWorkspaceRefresh";

const contextMessageCount = 50;
const LOCAL_SEND_ERROR_CLEAR_DELAY_MS = 4000;
const STOPPED_STREAM_TOOL_ID_PREFIX = "stopped-stream";
const STREAM_RETRY_INITIAL_DELAY_MS = 1000;
const STREAM_RETRY_MAX_DELAY_MS = 10000;
const HTML_CANVAS_STREAM_REFRESH_MS = 5000;
const CLIENT_TOOL_HEARTBEAT_INTERVAL_MS = 5000;
const WAITING_FOR_RESPONSE_SYNC_MS = 2000;

const normalizeContextPathname = (currentPathname) => {
    if (currentPathname === "/chat/new") {
        return "/chat";
    }

    return currentPathname;
};

const withSeedMessages = (chatData, seedMessages = []) => {
    if (
        !chatData ||
        !Array.isArray(seedMessages) ||
        seedMessages.length === 0
    ) {
        return chatData;
    }

    const messages = Array.isArray(chatData.messages) ? chatData.messages : [];
    const nextMessages = [...messages];
    const nextSeedMessages = seedMessages.filter((seedMessage) => {
        if (!seedMessage) {
            return false;
        }

        const lastMessage = nextMessages.at(-1);
        const alreadyPresent = nextMessages.some(
            (message) =>
                (seedMessage._clientId &&
                    message?._clientId === seedMessage._clientId) ||
                (seedMessage._id &&
                    message?._id &&
                    String(seedMessage._id) === String(message._id)),
        );
        if (
            alreadyPresent ||
            (lastMessage &&
                getMessageSignature(lastMessage) ===
                    getMessageSignature(seedMessage))
        ) {
            return false;
        }

        nextMessages.push(seedMessage);
        return true;
    });

    if (nextSeedMessages.length === 0) {
        return chatData;
    }

    return {
        ...chatData,
        messages: [...messages, ...nextSeedMessages],
    };
};

const buildDisplayedMessages = (draftPair, settledMessages) => {
    if (!draftPair || draftPair.localOnlyError) {
        return settledMessages;
    }

    return [
        ...(Array.isArray(draftPair.baseMessages)
            ? draftPair.baseMessages
            : []),
        ...(draftPair.userMessage ? [draftPair.userMessage] : []),
        ...(draftPair.assistantMessage ? [draftPair.assistantMessage] : []),
    ];
};

const createStoppedAssistantMessage = ({
    chatId,
    selectedEntityId = null,
    t,
}) => {
    const sentTime = new Date().toISOString();
    const toolEvent = createAssistantToolEventItem({
        callId: `${STOPPED_STREAM_TOOL_ID_PREFIX}:${String(chatId || "chat")}`,
        icon: "stop",
        userMessage: t("Stopped waiting for the live response"),
        status: "completed",
    });

    return {
        payload: [
            serializeAssistantPayloadItem(toolEvent),
            serializeAssistantPayloadItem(
                createAssistantTextItem(
                    t(
                        "Stopped generating the response. You can continue the conversation from here.",
                    ),
                ),
            ),
        ],
        sender: "assistant",
        sentTime,
        direction: "incoming",
        position: "single",
        entityId: selectedEntityId,
        isServerGenerated: true,
        _id: null,
        _clientId: `chat-status:stopped:${String(chatId || "chat")}:${Date.now()}`,
        tool: null,
        taskId: null,
        task: null,
    };
};

const createServiceUnavailableAssistantMessage = ({
    chatId,
    selectedEntityId = null,
    t,
}) => ({
    payload: [
        serializeAssistantPayloadItem(
            createAssistantToolEventItem({
                callId: `service-unavailable:${String(chatId || "chat")}`,
                icon: "...",
                userMessage: t("Server disconnected - retrying..."),
                status: "thinking",
            }),
        ),
    ],
    sender: "assistant",
    sentTime: new Date().toISOString(),
    direction: "incoming",
    position: "single",
    entityId: selectedEntityId,
    isServerGenerated: true,
    _id: null,
    _clientId: `chat-status:service-unavailable:${String(chatId || "chat")}:${Date.now()}`,
    tool: null,
    taskId: null,
    task: null,
});

const getStreamRequestError = async (response) => {
    let serverMessage = "";

    try {
        const payload = await response.clone().json();
        serverMessage =
            payload?.error || payload?.message || JSON.stringify(payload);
    } catch {
        try {
            serverMessage = await response.clone().text();
        } catch {
            serverMessage = "";
        }
    }

    const message =
        serverMessage?.trim() ||
        `Stream request failed: ${response.statusText || response.status}`;
    const error = new Error(message);
    error.status = response.status;
    error.serverMessage = serverMessage;

    return error;
};

const isServiceUnavailableError = (error) => {
    const status = Number(error?.status ?? error?.response?.status);
    if (Number.isFinite(status) && status >= 500) {
        return true;
    }

    const message = String(
        [error?.message, error?.serverMessage].filter(Boolean).join(" "),
    ).toLowerCase();

    return (
        message.includes("failed to fetch") ||
        message.includes("networkerror") ||
        message.includes("network request failed") ||
        message.includes("fetch failed") ||
        message.includes("econnrefused")
    );
};

const captureOptimisticSendCache = (queryClient, chatId) => {
    const targetId = String(chatId);

    return {
        chatId: targetId,
        previousChat: queryClient.getQueryData(["chat", targetId]),
        previousActiveChats: queryClient.getQueryData(["activeChats"]),
        previousChats: queryClient.getQueryData(["chats"]),
    };
};

const restoreCachedQueryData = (queryClient, queryKey, previousData) => {
    if (previousData === undefined) {
        queryClient.removeQueries({ queryKey, exact: true });
        return;
    }

    queryClient.setQueryData(queryKey, previousData);
};

const restoreOptimisticSendCache = (queryClient, snapshot) => {
    if (!queryClient || !snapshot?.chatId) {
        return;
    }

    restoreCachedQueryData(
        queryClient,
        ["chat", snapshot.chatId],
        snapshot.previousChat,
    );
    restoreCachedQueryData(
        queryClient,
        ["activeChats"],
        snapshot.previousActiveChats,
    );
    restoreCachedQueryData(queryClient, ["chats"], snapshot.previousChats);
};

const getChatAttachmentUrl = (fileObj) =>
    fileObj?.url || fileObj?.image_url?.url || fileObj?.file || null;

const getChatAttachmentFilename = (fileObj) =>
    fileObj?.displayFilename ||
    fileObj?.originalFilename ||
    fileObj?.filename ||
    "file";

const buildResolvedChatAttachmentPayload = (fileObj, resolvedFile) => {
    if (!fileObj || !resolvedFile) {
        return null;
    }

    const nextUrl =
        resolvedFile.shortLivedUrl ||
        resolvedFile.url ||
        getChatAttachmentUrl(fileObj);
    const nextBlobPath = resolvedFile.blobPath || fileObj.blobPath || null;
    const nextHash = resolvedFile.hash || fileObj.hash || null;
    const nextGcs = resolvedFile.gcs || fileObj.gcs || null;
    const currentUrl = getChatAttachmentUrl(fileObj);

    const shouldRefresh =
        (nextUrl && nextUrl !== currentUrl) ||
        (nextBlobPath && nextBlobPath !== fileObj.blobPath) ||
        (nextHash && nextHash !== fileObj.hash) ||
        (nextGcs && nextGcs !== fileObj.gcs);

    if (!shouldRefresh) {
        return null;
    }

    const payload = {
        ...fileObj,
        ...(nextHash ? { hash: nextHash } : {}),
        ...(nextBlobPath ? { blobPath: nextBlobPath } : {}),
        ...(nextGcs ? { gcs: nextGcs } : {}),
    };

    if (nextUrl) {
        payload.url = nextUrl;
        if (payload.type === "image_url" || payload.image_url) {
            payload.image_url = {
                ...(payload.image_url || {}),
                url: nextUrl,
            };
        }
        if (payload.type === "file" || payload.file) {
            payload.file = nextUrl;
        }
    }

    return JSON.stringify(payload);
};

function ChatContent({
    displayState = "full",
    container = "chatpage",
    viewingChat = null,
    chat = null,
    urlChatId = null,
    selectedEntityId: selectedEntityIdFromProp,
    entities,
    entityIconSize,
    instantOnly = false,
    onCopyAndContinue,
    copyInProgress = false,
}) {
    const { t, i18n } = useTranslation();
    const isRTL = i18n.dir() === "rtl";
    const client = useApolloClient();
    const user = useContext(CurrentUserContext);
    const { serverUrl } = useContext(ServerContext) || {};
    const { resolvedAgentModel, persistResolvedAgentModel } =
        useResolvedAgentModel(user);
    const router = useRouter();
    const pathname = usePathname();
    const dispatch = useDispatch();
    const store = useStore();
    const chatMessagesRef = useRef(null);
    const mountedRef = useRef(false);
    const activeChatIdRef = useRef(null);
    const focusTrigger = useSelector((state) => state.chat?.focusTrigger);
    const canvasContent = useSelector((state) => state.chat?.canvasContent);
    const activeTabId = useSelector((state) => state.chat?.activeTabId);
    const canvasTabs = useSelector((state) => state.chat?.canvasTabs || []);
    const pathnameRef = useRef(pathname);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

    // Keep pathname ref updated to ensure we always have current pathname for context
    useEffect(() => {
        pathnameRef.current = pathname;
    }, [pathname]);

    // Fetch user skills for the LoadSkill tool
    const { userSkills } = useSkills();

    // State for create applet confirmation dialog
    const [createAppletDialog, setCreateAppletDialog] = useState({
        open: false,
        confirmationId: null,
        name: null,
    });
    const [toolConfirmDialog, setToolConfirmDialog] = useState({
        open: false,
        title: "",
        description: "",
        confirmLabel: t("Confirm"),
        cancelLabel: t("Cancel"),
        destructive: false,
    });
    const [isLoadingOlder, setIsLoadingOlder] = useState(false);
    const toolConfirmResolverRef = useRef(null);
    const toolConfirmRequestRef = useRef(null);
    const toolConfirmQueueRef = useRef(null);
    const toolConfirmMountedRef = useRef(true);

    if (!toolConfirmQueueRef.current) {
        toolConfirmQueueRef.current = createQueuedConfirmationHandler(
            (options = {}) =>
                toolConfirmRequestRef.current
                    ? toolConfirmRequestRef.current(options)
                    : Promise.resolve(false),
        );
    }

    const resolveToolConfirm = useCallback((confirmed) => {
        const resolve = toolConfirmResolverRef.current;
        toolConfirmResolverRef.current = null;
        setToolConfirmDialog((current) =>
            current.open ? { ...current, open: false } : current,
        );
        if (resolve) {
            resolve(confirmed);
        }
    }, []);

    const openToolConfirmDialog = useCallback(
        ({
            title,
            description,
            confirmLabel,
            cancelLabel,
            destructive = false,
        } = {}) => {
            if (!toolConfirmMountedRef.current) {
                return Promise.resolve(false);
            }

            setToolConfirmDialog({
                open: true,
                title: title || t("Confirm Action"),
                description: description || "",
                confirmLabel: confirmLabel || t("Confirm"),
                cancelLabel: cancelLabel || t("Cancel"),
                destructive,
            });

            return new Promise((resolve) => {
                toolConfirmResolverRef.current = resolve;
            });
        },
        [t],
    );
    toolConfirmRequestRef.current = openToolConfirmDialog;

    const confirmToolAction = useCallback(
        (options = {}) => toolConfirmQueueRef.current(options),
        [],
    );

    useEffect(() => {
        // React Strict Mode mounts, cleans up, and re-mounts in development.
        // Reset this flag on each mount so confirmations are not auto-canceled
        // after the dev-only cleanup pass.
        toolConfirmMountedRef.current = true;

        return () => {
            toolConfirmMountedRef.current = false;
            if (toolConfirmResolverRef.current) {
                toolConfirmResolverRef.current(false);
                toolConfirmResolverRef.current = null;
            }
        };
    }, []);

    // Get contextual tools, context, and handlers from page context provider
    const pageContextValue = usePageContext();
    const { contextualTools, pageContext, pageContextGetter, toolHandlers } =
        pageContextValue;
    const addMessage = useAddMessage();
    const updateChatHook = useUpdateChat();
    const queryClient = useQueryClient();
    const viewingReadOnlyChat =
        displayState === "full" &&
        Boolean(viewingChat?.readOnly || chat?.readOnly);
    const chatId =
        urlChatId && urlChatId !== "undefined" && urlChatId !== "null"
            ? String(urlChatId)
            : chat?._id
              ? String(chat._id)
              : "";
    const [resolvedChatId, setResolvedChatId] = useState(chatId);
    const [draftPair, setDraftPair] = useState(null);
    const [isServiceUnavailable, setIsServiceUnavailable] = useState(false);
    const [pendingRetrySend, setPendingRetrySend] = useState(null);
    const previousExternalChatIdRef = useRef(chatId);
    const settledMessages = useMemo(
        () => (Array.isArray(chat?.messages) ? chat.messages : []),
        [chat?.messages],
    );
    const displayedMessages = useMemo(
        () => buildDisplayedMessages(draftPair, settledMessages),
        [draftPair, settledMessages],
    );

    useEffect(() => {
        if (!chatId) return;
        const previousChatId = previousExternalChatIdRef.current;

        if (previousChatId !== chatId) {
            setResolvedChatId(chatId);
            setDraftPair(null);
        }

        previousExternalChatIdRef.current = chatId;
    }, [chatId]);

    const effectiveChatId = resolvedChatId || chatId;

    useEffect(() => {
        activeChatIdRef.current = effectiveChatId
            ? String(effectiveChatId)
            : null;
    }, [effectiveChatId]);

    const renderBaseMessages = draftPair?.baseMessages || settledMessages;
    const pendingUserMessage = draftPair?.userMessage || null;
    const pendingAssistantMessage = draftPair?.assistantMessage || null;
    const isWaitingForServer = Boolean(
        draftPair?.waitingForServer ||
            (chat?.isChatLoading &&
                !chat?.isTemporary &&
                chat?.activeSubscriptionId),
    );
    const isChatLoading = Boolean(
        chat?.isChatLoading ||
            draftPair?.isStreaming ||
            draftPair?.waitingForServer,
    );

    useEffect(() => {
        if (!draftPair) {
            return;
        }

        if (draftPair.localOnlyError) {
            return;
        }

        const persistedTail = settledMessages.slice(
            draftPair.baseMessages.length,
        );
        const expectedPersistedCount = draftPair.assistantMessage ? 2 : 1;
        if (
            persistedTail.length < expectedPersistedCount ||
            (!draftPair.assistantMessage && isChatLoading) ||
            (draftPair.assistantMessage &&
                !persistedTail
                    .slice(-expectedPersistedCount)
                    .every((message) => Boolean(message?._id)))
        ) {
            return;
        }

        setDraftPair(null);
    }, [draftPair, isChatLoading, settledMessages]);

    useEffect(() => {
        if (!draftPair?.localOnlyError) {
            return;
        }

        const timeoutId = setTimeout(() => {
            setDraftPair((currentDraftPair) =>
                currentDraftPair?.localOnlyError ? null : currentDraftPair,
            );
        }, LOCAL_SEND_ERROR_CLEAR_DELAY_MS);

        return () => clearTimeout(timeoutId);
    }, [draftPair]);

    const publicChatOwner = viewingChat?.owner || chat?.owner;
    const hasMoreMessages = !!chat?.hasMoreMessages;

    const syncCommittedChat = useCallback(
        async (targetChatId) => {
            if (!targetChatId) {
                return null;
            }

            const { data: committedChat } = await axios.get(
                `/api/chats/${String(targetChatId)}?limit=${DEFAULT_CHAT_MESSAGES_LIMIT}`,
            );
            const cachedChat = queryClient.getQueryData([
                "chat",
                String(targetChatId),
            ]);
            const normalizedChat = normalizeChatForCache(
                cachedChat,
                mergeFetchedChatResponse(
                    queryClient,
                    targetChatId,
                    cachedChat,
                    committedChat,
                ),
            );
            queryClient.setQueryData(
                ["chat", String(targetChatId)],
                normalizedChat,
            );
            return normalizedChat;
        },
        [queryClient],
    );

    const loadOlderMessages = useCallback(async () => {
        if (!effectiveChatId || isLoadingOlder) return;
        if (!chat?.hasMoreMessages && !chat?.messagesTruncated) return;

        setIsLoadingOlder(true);
        try {
            const { data: fullChat } = await axios.get(
                `/api/chats/${String(effectiveChatId)}`,
            );
            const cachedChat = queryClient.getQueryData([
                "chat",
                effectiveChatId,
            ]);
            const normalizedChat = normalizeChatForCache(cachedChat, fullChat);
            queryClient.setQueryData(["chat", effectiveChatId], normalizedChat);
        } catch (error) {
            console.error("Error loading older messages:", error);
        } finally {
            setIsLoadingOlder(false);
        }
    }, [
        effectiveChatId,
        chat?.hasMoreMessages,
        chat?.messagesTruncated,
        isLoadingOlder,
        queryClient,
    ]);

    // Check file URLs in the background and replace missing files with placeholders
    const checkedFilesRef = useRef({
        checked: new Set(),
        chatId: null,
        lastIndex: 0,
    });
    useEffect(() => {
        if (
            !effectiveChatId ||
            !renderBaseMessages.length ||
            viewingReadOnlyChat
        ) {
            return;
        }

        // Reset checked files when chat changes
        if (effectiveChatId !== checkedFilesRef.current.chatId) {
            checkedFilesRef.current = {
                checked: new Set(),
                chatId: effectiveChatId,
                lastIndex: 0,
            };
        }

        // Extract all file URLs from messages
        const filesToCheck = [];
        const startIndex =
            checkedFilesRef.current.lastIndex > renderBaseMessages.length
                ? 0
                : checkedFilesRef.current.lastIndex;
        for (
            let messageIndex = startIndex;
            messageIndex < renderBaseMessages.length;
            messageIndex += 1
        ) {
            const message = renderBaseMessages[messageIndex];
            if (!Array.isArray(message.payload)) continue;

            message.payload.forEach((payloadItem, payloadIndex) => {
                try {
                    const fileObj = JSON.parse(payloadItem);
                    if (
                        (fileObj.type === "image_url" ||
                            fileObj.type === "file") &&
                        !fileObj.hideFromClient
                    ) {
                        const fileUrl =
                            fileObj.url ||
                            fileObj.image_url?.url ||
                            fileObj.file;
                        const fileKey = `${message.id || message._id}-${payloadIndex}-${fileUrl}`;

                        // Skip if we've already checked this file
                        if (checkedFilesRef.current.checked.has(fileKey)) {
                            return;
                        }

                        filesToCheck.push({
                            messageIndex,
                            payloadIndex,
                            messageId: message.id || message._id,
                            fileObj,
                            fileUrl,
                            fileKey,
                        });
                    }
                } catch (e) {
                    // Not a JSON object, skip
                }
            });
        }
        checkedFilesRef.current.lastIndex = renderBaseMessages.length;

        if (filesToCheck.length === 0) return;

        // Check files in the background
        const checkFiles = async () => {
            const filesToReplace = [];
            const filesToRefresh = [];

            await Promise.all(
                filesToCheck.map(
                    async ({
                        fileUrl,
                        fileKey,
                        fileObj,
                        messageIndex,
                        payloadIndex,
                        messageId,
                    }) => {
                        // Mark as checked immediately to avoid duplicate checks
                        checkedFilesRef.current.checked.add(fileKey);

                        const resolution = await resolveFileReference({
                            url: fileUrl,
                            hash: fileObj.hash,
                            blobPath: fileObj.blobPath,
                            contextId: user?.contextId,
                            chatId: effectiveChatId,
                            fileScope: "chat",
                        });

                        if (!resolution.exists) {
                            filesToReplace.push({
                                messageIndex,
                                payloadIndex,
                                messageId,
                                fileObj,
                            });
                            return;
                        }

                        const refreshedPayload =
                            buildResolvedChatAttachmentPayload(
                                fileObj,
                                resolution.file,
                            );

                        if (refreshedPayload) {
                            filesToRefresh.push({
                                messageIndex,
                                payloadIndex,
                                messageId,
                                payload: refreshedPayload,
                            });
                        }
                    },
                ),
            );

            if (filesToReplace.length === 0 && filesToRefresh.length === 0) {
                return;
            }

            const refreshedPayloads = new Map(
                filesToRefresh.map((file) => [
                    `${file.messageIndex}:${file.payloadIndex}`,
                    file.payload,
                ]),
            );
            const replacementPayloads = new Map(
                filesToReplace.map((file) => [
                    `${file.messageIndex}:${file.payloadIndex}`,
                    createFilePlaceholder(
                        file.fileObj,
                        t,
                        getChatAttachmentFilename(file.fileObj),
                    ),
                ]),
            );

            const updatedMessages = renderBaseMessages.map((message, index) => {
                if (!Array.isArray(message.payload)) {
                    return message;
                }

                let didChange = false;
                const updatedPayload = message.payload.map(
                    (payloadItem, payloadIndex) => {
                        const payloadKey = `${index}:${payloadIndex}`;
                        if (refreshedPayloads.has(payloadKey)) {
                            didChange = true;
                            return refreshedPayloads.get(payloadKey);
                        }
                        if (replacementPayloads.has(payloadKey)) {
                            didChange = true;
                            return replacementPayloads.get(payloadKey);
                        }
                        return payloadItem;
                    },
                );

                return didChange
                    ? { ...message, payload: updatedPayload }
                    : message;
            });

            try {
                await updateChatHook.mutateAsync({
                    chatId: String(effectiveChatId),
                    messages: updatedMessages,
                });
            } catch (error) {
                console.warn(
                    "Failed to refresh chat attachment references:",
                    error,
                );
            }
        };

        // Run check in background (don't block UI)
        checkFiles();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        renderBaseMessages,
        effectiveChatId,
        viewingReadOnlyChat,
        t,
        updateChatHook,
        user?.contextId,
    ]);

    const isStreamingRef = useRef(false);

    const getCanvasSnapshotForChat = useCallback(
        (targetChatId = effectiveChatId) => {
            const chatState = store.getState()?.chat || {};
            const normalizedTargetChatId = targetChatId
                ? String(targetChatId)
                : null;
            const isActiveCanvasChat =
                normalizedTargetChatId &&
                chatState.activeCanvasChatId &&
                String(chatState.activeCanvasChatId) === normalizedTargetChatId;

            if (isActiveCanvasChat) {
                return {
                    canvasContent: chatState.canvasContent ?? null,
                    canvasTabs: Array.isArray(chatState.canvasTabs)
                        ? chatState.canvasTabs
                        : [],
                    activeTabId: chatState.activeTabId ?? null,
                    canvasVisible:
                        typeof chatState.canvasVisible === "boolean"
                            ? chatState.canvasVisible
                            : true,
                };
            }

            const bucket = normalizedTargetChatId
                ? chatState.canvasByChatId?.[normalizedTargetChatId]
                : null;
            return {
                canvasContent: bucket?.canvasContent ?? null,
                canvasTabs: Array.isArray(bucket?.canvasTabs)
                    ? bucket.canvasTabs
                    : [],
                activeTabId: bucket?.activeTabId ?? null,
                canvasVisible:
                    typeof bucket?.canvasVisible === "boolean"
                        ? bucket.canvasVisible
                        : true,
            };
        },
        [effectiveChatId, store],
    );

    // After each server-side tool finishes (and on stream complete) we may
    // need to pull fresh content into the active tab. For article tabs the
    // workspace file is the source of truth — bumping workspaceContentVersion
    // tells useArticleEditor to re-read it. For HTML preview tabs we fetch
    // the file body and stuff it into the tab.
    const handleStreamCompleteHtmlFallback = useCallback(
        async ({ source = "tool" } = {}) => {
            const targetChatId = effectiveChatId
                ? String(effectiveChatId)
                : null;
            const snapshot = getCanvasSnapshotForChat(targetChatId);
            const targetTabId = snapshot.activeTabId;
            const tab = snapshot.canvasTabs.find((t) => t.id === targetTabId);
            if (!tab) return;

            const tabType = tab.content?.type;
            const isArticleTab = tabType === "article" || tabType === "story";
            const isHtmlTab = tabType === "html";
            if (!isArticleTab && !isHtmlTab) return;
            if (!tab.content?.workspacePath || !selectedEntityIdFromProp)
                return;

            // Article tabs only refresh on stream-complete to avoid mid-stream
            // remounts that wipe in-progress edits and flicker the editor.
            if (isArticleTab) {
                if (source !== "stream-complete") return;
                dispatch(
                    targetChatId
                        ? updateCanvasTabForChat({
                              chatId: targetChatId,
                              tabId: targetTabId,
                              content: { workspaceContentVersion: Date.now() },
                          })
                        : updateCanvasTab({
                              tabId: targetTabId,
                              content: { workspaceContentVersion: Date.now() },
                          }),
                );
                return;
            }

            try {
                const params = new URLSearchParams({
                    entityId: selectedEntityIdFromProp,
                    path: tab.content.workspacePath,
                });
                const res = await fetch(`/api/workspace/file?${params}`);
                if (!res.ok) return;
                const htmlContent = await res.text();
                const refreshContent = buildHtmlWorkspaceRefreshContent(
                    tab.content,
                    htmlContent,
                );
                if (!refreshContent) return;
                dispatch(
                    targetChatId
                        ? updateCanvasTabForChat({
                              chatId: targetChatId,
                              tabId: targetTabId,
                              content: refreshContent,
                          })
                        : updateCanvasTab({
                              tabId: targetTabId,
                              content: refreshContent,
                          }),
                );
            } catch {
                // Best-effort — ignore failures
            }
        },
        [
            dispatch,
            effectiveChatId,
            getCanvasSnapshotForChat,
            selectedEntityIdFromProp,
        ],
    );

    const sendClientToolHeartbeat = useCallback(
        async (toolInfo) => {
            const toolCallbackId = toolInfo?.toolCallbackId;
            const requestId =
                toolInfo?.requestId || toolInfo?.chatId || "unknown";

            if (!toolCallbackId) {
                return false;
            }

            try {
                const response = await client.mutate({
                    mutation: MUTATIONS.CLIENT_TOOL_HEARTBEAT,
                    variables: {
                        requestId,
                        toolCallbackId,
                    },
                });
                return response?.data?.clientToolHeartbeat === true;
            } catch (error) {
                console.debug("Client tool heartbeat failed:", error);
                return false;
            }
        },
        [client],
    );

    const handleClientSideToolCall = useCallback(
        async (toolInfo) => {
            const toolName = toolInfo.toolCallbackName?.toLowerCase();
            const toolCallbackId = toolInfo.toolCallbackId;
            const requestId =
                toolInfo.requestId || toolInfo.chatId || "unknown";

            const submitToolResult = async (
                result,
                success,
                errorMessage = null,
            ) => {
                const resultData = success
                    ? result
                    : JSON.stringify({
                          error: errorMessage || "Tool execution failed",
                      });

                const submitResultMutation = async () => {
                    const response = await client.mutate({
                        mutation: MUTATIONS.SUBMIT_CLIENT_TOOL_RESULT,
                        variables: {
                            requestId,
                            toolCallbackId,
                            result: success
                                ? JSON.stringify(result)
                                : resultData,
                            success,
                        },
                    });
                    if (response?.data?.submitClientToolResult !== true) {
                        throw new Error(
                            "Server did not accept client tool result",
                        );
                    }
                };

                try {
                    await submitResultMutation();
                    return true;
                } catch (error) {
                    try {
                        await new Promise((resolve) =>
                            setTimeout(resolve, 500),
                        );
                        await submitResultMutation();
                        return true;
                    } catch {
                        toast.error(
                            "Failed to report tool result to server. The tool may not complete properly.",
                        );
                        return false;
                    }
                }
            };

            const startHeartbeat = () => {
                void sendClientToolHeartbeat(toolInfo);
                const intervalId = setInterval(() => {
                    void sendClientToolHeartbeat(toolInfo);
                }, CLIENT_TOOL_HEARTBEAT_INTERVAL_MS);
                return () => clearInterval(intervalId);
            };

            if (!toolCallbackId) {
                await submitToolResult(null, false, "Missing toolCallbackId");
                return;
            }

            const handler =
                toolHandlers[toolName] || CLIENT_SIDE_TOOL_HANDLERS[toolName];

            if (!handler) {
                const errorMessage = `Tool ${toolName} is not implemented on the client.`;
                toast.error(errorMessage);
                await submitToolResult(null, false, errorMessage);
                return;
            }

            const stopHeartbeat = startHeartbeat();
            try {
                const getActiveCanvasTabContent = () => {
                    const snapshot = getCanvasSnapshotForChat(effectiveChatId);
                    if (!snapshot.canvasVisible) {
                        return {};
                    }
                    if (
                        snapshot.activeTabId &&
                        Array.isArray(snapshot.canvasTabs)
                    ) {
                        return (
                            snapshot.canvasTabs.find(
                                (tab) => tab.id === snapshot.activeTabId,
                            )?.content || {}
                        );
                    }
                    return snapshot.canvasContent || {};
                };
                const context = {
                    router,
                    dispatch,
                    isStreaming: isStreamingRef.current,
                    isActiveChat:
                        mountedRef.current &&
                        activeChatIdRef.current === String(effectiveChatId),
                    queryClient,
                    chatId: effectiveChatId,
                    user,
                    serverUrl,
                    t,
                    getEntityId: () => selectedEntityIdFromProp || "",
                    getActiveTabId: () =>
                        getCanvasSnapshotForChat(effectiveChatId).activeTabId ||
                        null,
                    getActiveHtmlContent: getActiveCanvasTabContent,
                    getCanvasSnapshot: () =>
                        getCanvasSnapshotForChat(effectiveChatId),
                    confirmAction: confirmToolAction,
                    toolInteraction: {
                        confirm: confirmToolAction,
                    },
                };
                const focusError = getClientSideToolFocusError(
                    toolName,
                    context,
                );
                if (focusError) {
                    throw new Error(focusError);
                }
                const result = await handler(toolInfo, context);

                if (!result.success) {
                    throw new Error(result.error || "Tool execution failed");
                }

                if (!(await submitToolResult(result.data, true))) {
                    throw new Error("Failed to submit tool result to server");
                }
            } catch (error) {
                try {
                    await submitToolResult(
                        null,
                        false,
                        error.message || error.toString(),
                    );
                } catch (submitError) {
                    console.error(
                        `Failed to submit error result for ${toolName}:`,
                        submitError,
                    );
                    throw error;
                }
            } finally {
                stopHeartbeat();
            }
        },
        [
            client,
            sendClientToolHeartbeat,
            router,
            dispatch,
            toolHandlers,
            queryClient,
            effectiveChatId,
            user,
            confirmToolAction,
            t,
            serverUrl,
            selectedEntityIdFromProp,
            getCanvasSnapshotForChat,
        ],
    );

    const handleError = useCallback((error) => {
        if (error?.suppressToast) {
            return;
        }

        toast.error(error.message);
    }, []);

    const getMessagePayload = useCallback(
        (message) => {
            if (message.taskId) {
                const notification = queryClient.getQueryData([
                    "tasks",
                    message.taskId,
                ]);
                if (notification) {
                    return `Status: ${notification.status}\n                Progress: ${notification.progress || 0}\n                Type: ${notification.type}\n                Original Message: ${message.payload}`;
                }
            }
            return message.payload;
        },
        [queryClient],
    );

    const getModelMessageContent = useCallback(
        (message) => {
            const payload = getMessagePayload(message);
            return buildModelPayloadFromStoredPayload(payload);
        },
        [getMessagePayload],
    );

    const getMessagePreviewText = useCallback(
        (message) => {
            const payload = getMessagePayload(message);
            return extractPreviewTextFromStoredPayload(payload);
        },
        [getMessagePayload],
    );

    const generateChatTitleIfNeeded = useCallback(
        async (targetChat) => {
            const targetChatId = String(targetChat?._id || "");
            if (!targetChatId) {
                return;
            }
            if (targetChat?.titleSetByUser) {
                return;
            }

            const titleConversation = (targetChat?.messages || [])
                .slice(-contextMessageCount)
                .map((message) => {
                    const content = getMessagePreviewText(message)?.trim();
                    if (!content) {
                        return null;
                    }

                    return {
                        role:
                            message?.sender === "assistant"
                                ? "assistant"
                                : "user",
                        content,
                    };
                })
                .filter(Boolean);

            if (titleConversation.length === 0) {
                return;
            }

            try {
                const { data } = await client.query({
                    query: QUERIES.CHAT_TITLE,
                    variables: {
                        title: targetChat?.title || "",
                        chatHistory: titleConversation,
                        stream: false,
                    },
                    fetchPolicy: "network-only",
                });

                const newTitle = data?.chat_title?.result?.trim();
                if (!newTitle || newTitle === targetChat?.title) {
                    return;
                }

                await updateChatHook.mutateAsync({
                    chatId: targetChatId,
                    title: newTitle,
                });
            } catch (error) {
                console.error("Error updating chat title:", error);
            }
        },
        [client, getMessagePreviewText, updateChatHook],
    );

    const handleStreamComplete = useCallback(
        async ({ chatId: completedChatId, payload, assistantMessage }) => {
            const targetChatId = String(
                completedChatId || effectiveChatId || "",
            );
            const isCurrentChat =
                mountedRef.current && activeChatIdRef.current === targetChatId;

            if (targetChatId && isCurrentChat) {
                setResolvedChatId(targetChatId);
            }

            if (isCurrentChat) {
                setDraftPair((currentDraftPair) =>
                    currentDraftPair
                        ? {
                              ...currentDraftPair,
                              assistantMessage:
                                  payload && assistantMessage
                                      ? assistantMessage
                                      : currentDraftPair.assistantMessage,
                              isStreaming: false,
                              waitingForServer: Boolean(payload),
                          }
                        : currentDraftPair,
                );
            }
            queryClient.setQueryData(["chatSending", targetChatId], null);

            try {
                const committedChat = await syncCommittedChat(targetChatId);
                ensureChatInActiveChats(queryClient, committedChat);
                syncChatToListCaches(queryClient, committedChat);
                if (isCurrentChat && !committedChat?.isChatLoading) {
                    setDraftPair(null);
                }
                await generateChatTitleIfNeeded(committedChat);
                queryClient.invalidateQueries({
                    queryKey: ["activeChats"],
                });
                queryClient.invalidateQueries({ queryKey: ["chats"] });
                queryClient.invalidateQueries({
                    queryKey: ["totalChatCount"],
                });
            } catch (error) {
                console.error("Error syncing completed chat:", error);
                if (targetChatId) {
                    queryClient.invalidateQueries({
                        queryKey: ["chat", targetChatId],
                    });
                }
                if (isCurrentChat) {
                    setDraftPair((currentDraftPair) =>
                        currentDraftPair
                            ? {
                                  ...currentDraftPair,
                                  isStreaming: false,
                                  waitingForServer: true,
                              }
                            : currentDraftPair,
                    );
                }
            }

            if (isCurrentChat) {
                await handleStreamCompleteHtmlFallback({
                    source: "stream-complete",
                });
            }
        },
        [
            effectiveChatId,
            generateChatTitleIfNeeded,
            queryClient,
            syncCommittedChat,
            handleStreamCompleteHtmlFallback,
        ],
    );

    const handleStreamDetached = useCallback(
        ({ chatId: detachedChatId }) => {
            const targetChatId = String(
                detachedChatId || effectiveChatId || "",
            );
            const isCurrentChat =
                mountedRef.current && activeChatIdRef.current === targetChatId;
            if (targetChatId) {
                if (isCurrentChat) {
                    setResolvedChatId(targetChatId);
                }
                queryClient.setQueryData(["chatSending", targetChatId], null);
                queryClient.invalidateQueries({
                    queryKey: ["chat", targetChatId],
                });
            }

            if (isCurrentChat) {
                setDraftPair((currentDraftPair) => ({
                    baseMessages:
                        queryClient.getQueryData(["chat", targetChatId])
                            ?.messages ||
                        currentDraftPair?.baseMessages ||
                        settledMessages,
                    userMessage: null,
                    assistantMessage: null,
                    isStreaming: false,
                    waitingForServer: true,
                }));
            }
        },
        [effectiveChatId, queryClient, settledMessages],
    );

    const {
        isStreaming,
        setIsStreaming,
        setSubscriptionId,
        clearStreamingState,
        streamingChatId,
    } = useStreamingMessages({
        chat: {
            ...(chat || {}),
            _id: effectiveChatId,
            isChatLoading,
        },
        updateChatHook,
        currentEntityId: selectedEntityIdFromProp,
        onClientSideToolHeartbeat: sendClientToolHeartbeat,
        onClientSideToolCall: handleClientSideToolCall,
        onStreamComplete: handleStreamComplete,
        onStreamDetached: handleStreamDetached,
        onServerToolFinish: handleStreamCompleteHtmlFallback,
    });

    useEffect(() => {
        isStreamingRef.current = isStreaming;
    }, [isStreaming]);

    useEffect(() => {
        if (!isWaitingForServer || isStreaming) return;
        if (!effectiveChatId) return;

        let cancelled = false;
        let inFlight = false;

        const reconcileWaitingChat = async () => {
            if (cancelled || inFlight) return;
            inFlight = true;
            try {
                const committedChat = await syncCommittedChat(effectiveChatId);
                if (cancelled || !committedChat) return;
                ensureChatInActiveChats(queryClient, committedChat);
                syncChatToListCaches(queryClient, committedChat);
                if (!committedChat.isChatLoading) {
                    setDraftPair((currentDraftPair) =>
                        currentDraftPair?.waitingForServer
                            ? null
                            : currentDraftPair,
                    );
                }
            } catch {
                queryClient.invalidateQueries({
                    queryKey: ["chat", String(effectiveChatId)],
                });
            } finally {
                inFlight = false;
            }
        };

        void reconcileWaitingChat();
        const intervalId = setInterval(
            reconcileWaitingChat,
            WAITING_FOR_RESPONSE_SYNC_MS,
        );

        return () => {
            cancelled = true;
            clearInterval(intervalId);
        };
    }, [
        effectiveChatId,
        isStreaming,
        isWaitingForServer,
        queryClient,
        syncCommittedChat,
    ]);

    useEffect(() => {
        if (!isStreaming) return;
        const tab = canvasTabs.find((t) => t.id === activeTabId);
        if (
            tab?.content?.type !== "html" ||
            !tab.content?.appletId ||
            !tab.content?.workspacePath
        ) {
            return;
        }

        const interval = setInterval(() => {
            handleStreamCompleteHtmlFallback({ source: "periodic" });
        }, HTML_CANVAS_STREAM_REFRESH_MS);

        return () => clearInterval(interval);
    }, [
        activeTabId,
        canvasTabs,
        handleStreamCompleteHtmlFallback,
        isStreaming,
    ]);

    const isSendBlocked =
        isServiceUnavailable && !isStreaming && !isWaitingForServer;

    const handleStopStreaming = useCallback(async () => {
        const targetChatId = String(
            streamingChatId || effectiveChatId || chatId || "",
        );
        const cachedChat = targetChatId
            ? queryClient.getQueryData(["chat", targetChatId])
            : null;
        const requestId = String(
            cachedChat?.activeSubscriptionId ||
                chat?.activeSubscriptionId ||
                "",
        );
        const stoppedAssistantMessage = createStoppedAssistantMessage({
            chatId: targetChatId,
            selectedEntityId: selectedEntityIdFromProp,
            t,
        });

        clearStreamingState();
        if (targetChatId) {
            queryClient.setQueryData(["chatSending", targetChatId], null);
        }

        setDraftPair((currentDraftPair) => ({
            baseMessages: currentDraftPair?.baseMessages || settledMessages,
            userMessage: currentDraftPair?.userMessage || null,
            assistantMessage: stoppedAssistantMessage,
            isStreaming: false,
            waitingForServer: false,
        }));

        if (!targetChatId) {
            return;
        }

        const seededChat = withSeedMessages(
            cachedChat,
            [draftPair?.userMessage].filter(Boolean),
        );
        const nextMessages = [
            ...(Array.isArray(seededChat?.messages) ? seededChat.messages : []),
            stoppedAssistantMessage,
        ];

        try {
            if (requestId) {
                try {
                    await client.mutate({
                        mutation: MUTATIONS.CANCEL_REQUEST,
                        variables: {
                            requestId,
                        },
                    });
                } catch (cancelError) {
                    console.error(
                        "Failed to cancel active chat request; falling back to stopRequested cleanup:",
                        cancelError,
                    );
                }
            }

            const stoppedChat = await updateChatHook.mutateAsync({
                chatId: targetChatId,
                messages: nextMessages,
                isChatLoading: false,
                stopRequested: true,
                selectedEntityId: selectedEntityIdFromProp,
            });
            const normalizedStoppedChat = normalizeChatForCache(
                cachedChat,
                stoppedChat,
            );
            queryClient.setQueryData(
                ["chat", targetChatId],
                normalizedStoppedChat,
            );
            ensureChatInActiveChats(queryClient, normalizedStoppedChat);
            syncChatToListCaches(queryClient, normalizedStoppedChat);
        } catch (error) {
            handleError(error);
        }
    }, [
        streamingChatId,
        effectiveChatId,
        chatId,
        selectedEntityIdFromProp,
        clearStreamingState,
        queryClient,
        settledMessages,
        draftPair?.userMessage,
        updateChatHook,
        handleError,
        t,
        chat?.activeSubscriptionId,
        client,
    ]);

    const handleSend = useCallback(
        async (sendMessage, overrideMessages, options = {}) => {
            const { retryAttempt = 0 } = options;
            let currentChatId = effectiveChatId || chatId;
            const baseMessages = overrideMessages || displayedMessages;
            const optimisticUserMessage =
                typeof sendMessage === "string" || Array.isArray(sendMessage)
                    ? {
                          payload: sendMessage,
                          _clientId: `draft-user:${String(currentChatId)}:${Date.now()}`,
                          sender: "user",
                          sentTime: new Date().toISOString(),
                          direction: "outgoing",
                          position: "single",
                      }
                    : {
                          ...sendMessage,
                          _clientId:
                              sendMessage?._clientId ||
                              `draft-user:${String(currentChatId)}:${Date.now()}`,
                      };
            const isReplay = Array.isArray(overrideMessages);
            let optimisticCacheSnapshot = null;
            let persistedChat = null;

            try {
                // Reset streaming state (important before sending) unless another chat is streaming
                if (
                    !streamingChatId ||
                    (currentChatId &&
                        String(streamingChatId) === String(currentChatId))
                ) {
                    clearStreamingState();
                }
                if (
                    !currentChatId ||
                    currentChatId === "undefined" ||
                    currentChatId === "null"
                ) {
                    throw new Error("Chat ID is required");
                }

                if (String(currentChatId) === "new") {
                    throw new Error("New chat must be created before sending");
                }

                optimisticCacheSnapshot = captureOptimisticSendCache(
                    queryClient,
                    currentChatId,
                );
                queryClient.setQueryData(
                    ["chatSending", String(currentChatId)],
                    Date.now(),
                );

                const messageToPersist = {
                    ...optimisticUserMessage,
                    payload: getMessagePayload(optimisticUserMessage),
                };
                syncInFlightChatCache(queryClient, currentChatId, {
                    fallbackChat: chat,
                    messages: [...baseMessages, messageToPersist],
                });

                setDraftPair({
                    baseMessages,
                    userMessage: optimisticUserMessage,
                    assistantMessage: null,
                    isStreaming: true,
                });
                setIsStreaming(true);

                if (isReplay) {
                    await updateChatHook.mutateAsync({
                        chatId: currentChatId,
                        messages: overrideMessages,
                        allowMessageTruncation: true,
                        selectedEntityId: selectedEntityIdFromProp,
                    });
                }

                persistedChat = await addMessage.mutateAsync({
                    chatId: currentChatId,
                    message: messageToPersist,
                    skipCacheUpdate: true,
                });
                syncInFlightChatCache(queryClient, currentChatId, {
                    fallbackChat: chat,
                    serverChat: persistedChat,
                });

                const conversation = baseMessages
                    .slice(-contextMessageCount)
                    .filter((message) => {
                        if (!message.tool) return true;
                        try {
                            const tool = JSON.parse(message.tool);
                            return !tool.hideFromModel;
                        } catch (error) {
                            console.error("Invalid JSON in tool:", error);
                            return true;
                        }
                    })
                    .map((message) => {
                        if (message.sender === "assistant") {
                            const content = getModelMessageContent(message);
                            if (content == null) {
                                return null;
                            }
                            if (
                                typeof content === "string" &&
                                content.trim().length === 0
                            ) {
                                return null;
                            }
                            if (
                                Array.isArray(content) &&
                                content.length === 0
                            ) {
                                return null;
                            }
                            return {
                                role: "assistant",
                                content,
                            };
                        }

                        return { role: "user", content: message.payload };
                    })
                    .filter(Boolean);

                conversation.push({
                    role: "user",
                    content: optimisticUserMessage.payload,
                });

                const { aiMemorySelfModify, aiName } = user;

                // Use entity ID directly from the prop
                const currentSelectedEntityId = selectedEntityIdFromProp || "";

                // Filter client-side tools based on current route and canvas state
                const filteredClientSideTools = filterToolsByRoute(
                    pathname,
                    CLIENT_SIDE_TOOLS,
                    canvasContent,
                );

                // Combine filtered base tools with contextual tools and skills tool.
                // In RTL, merge English + Arabic `description` for the model (see `descriptionAr` on each tool).
                const allTools = applyBilingualClientSideTools(
                    [
                        ...filteredClientSideTools,
                        ...contextualTools,
                        getLoadSkillTool(userSkills),
                    ],
                    isRTL,
                );

                // Always include the current URL/pathname in context
                // Use ref to ensure we have the most current pathname
                const currentPathname = normalizeContextPathname(
                    pathnameRef.current || pathname,
                    currentChatId,
                );

                // Get page context if provided (provider handles staleness automatically)
                // Use getter function if available (for on-demand fetching), otherwise use static context
                let pageSpecificContext = pageContext;
                if (
                    pageContextGetter &&
                    typeof pageContextGetter === "function"
                ) {
                    try {
                        const dynamicContext = pageContextGetter();
                        if (dynamicContext) {
                            pageSpecificContext = dynamicContext;
                        }
                    } catch {}
                }

                const relevantSkillContext = canvasContent?.appletId
                    ? buildRelevantSkillReferenceContext(
                          "applets",
                          "The active canvas contains a Concierge applet.",
                      )
                    : "";

                if (relevantSkillContext) {
                    pageSpecificContext = pageSpecificContext
                        ? `${pageSpecificContext}\n${relevantSkillContext}`
                        : relevantSkillContext;
                }

                // Build combined context using global context mechanism
                // Global context (pathname, recent chats) is always included
                // Page-specific context is appended if provided
                const finalPageContext = combineContexts({
                    pathname: currentPathname,
                    activeChats:
                        queryClient.getQueryData(["activeChats"]) || [],
                    currentChatId,
                    pageContext: pageSpecificContext,
                    maxRecentChats: 20,
                });

                // OpenAI API requires all system messages to be at the beginning
                // Insert page context as system message at the start of conversation
                conversation.unshift({
                    role: "system",
                    content: finalPageContext,
                });

                const datetimeInfo = JSON.parse(composeUserDateTimeInfo());
                const userInfoData = {
                    ...datetimeInfo,
                    name: user?.name,
                    username: user?.username,
                    userId: user?.userId,
                    timezone:
                        typeof Intl !== "undefined"
                            ? Intl.DateTimeFormat().resolvedOptions().timeZone
                            : undefined,
                    language:
                        typeof window !== "undefined"
                            ? navigator.language
                            : undefined,
                };
                Object.keys(userInfoData).forEach((key) => {
                    if (userInfoData[key] === undefined) {
                        delete userInfoData[key];
                    }
                });
                const userInfo =
                    Object.keys(userInfoData).length > 0
                        ? JSON.stringify(userInfoData)
                        : "";
                persistResolvedAgentModel(resolvedAgentModel);

                // POST to stream endpoint with conversation data
                const response = await fetch(
                    `/api/chats/${currentChatId}/stream`,
                    {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                        },
                        body: JSON.stringify({
                            conversation,
                            aiName:
                                entities?.find(
                                    (e) => e.id === currentSelectedEntityId,
                                )?.name || aiName,
                            aiMemorySelfModify,
                            title: chat?.title,
                            entityId: currentSelectedEntityId,
                            model: resolvedAgentModel,
                            userInfo,
                            clientSideTools: JSON.stringify(allTools), // Stringify for API - includes contextual tools
                        }),
                    },
                );

                if (!response.ok) {
                    throw await getStreamRequestError(response);
                }

                setIsServiceUnavailable(false);
                setPendingRetrySend(null);

                // Pass the response directly — its body is read once by useStreamingMessages.
                setSubscriptionId(response);

                return;
            } catch (error) {
                const serviceUnavailable = isServiceUnavailableError(error);

                if (currentChatId) {
                    queryClient.setQueryData(
                        ["chatSending", String(currentChatId)],
                        null,
                    );
                }
                setIsStreaming(false);
                if (serviceUnavailable) {
                    error.suppressToast = true;
                    setIsServiceUnavailable(true);
                    setPendingRetrySend({
                        sendMessage: optimisticUserMessage,
                        baseMessages,
                        retryAttempt:
                            Number.isFinite(retryAttempt) && retryAttempt >= 0
                                ? retryAttempt
                                : 0,
                    });
                } else {
                    setPendingRetrySend(null);
                    setIsServiceUnavailable(false);
                }
                handleError(error);

                const errorAssistantMessage = serviceUnavailable
                    ? createServiceUnavailableAssistantMessage({
                          chatId: currentChatId,
                          selectedEntityId: selectedEntityIdFromProp,
                          t,
                      })
                    : {
                          payload: t(
                              "Something went wrong trying to respond to your request. Please try something else or start over to continue.",
                          ),
                          sender: "assistant",
                          sentTime: new Date().toISOString(),
                          direction: "incoming",
                          position: "single",
                      };

                let nextBaseMessages = baseMessages;
                let nextPendingUserMessage = optimisticUserMessage;

                if (persistedChat) {
                    const cachedChat = queryClient.getQueryData([
                        "chat",
                        String(currentChatId),
                    ]);

                    if (serviceUnavailable) {
                        try {
                            const rollbackResponse = await axios.put(
                                `/api/chats/${String(currentChatId)}`,
                                {
                                    messages: baseMessages,
                                    isChatLoading: false,
                                    activeSubscriptionId: null,
                                    selectedEntityId: selectedEntityIdFromProp,
                                },
                            );
                            const rolledBackChat = normalizeChatForCache(
                                cachedChat,
                                rollbackResponse.data,
                            );
                            queryClient.setQueryData(
                                ["chat", String(currentChatId)],
                                rolledBackChat,
                            );
                            ensureChatInActiveChats(
                                queryClient,
                                rolledBackChat,
                            );
                            syncChatToListCaches(queryClient, rolledBackChat);
                            nextBaseMessages = Array.isArray(
                                rolledBackChat?.messages,
                            )
                                ? rolledBackChat.messages
                                : baseMessages;
                        } catch (rollbackError) {
                            console.error(
                                "Failed to roll back chat after stream bootstrap failure:",
                                rollbackError,
                            );
                            nextBaseMessages = baseMessages;
                        }
                    } else {
                        const recoveredChat = normalizeChatForCache(
                            cachedChat,
                            {
                                ...persistedChat,
                                isChatLoading: false,
                                activeSubscriptionId: null,
                            },
                        );
                        queryClient.setQueryData(
                            ["chat", String(currentChatId)],
                            recoveredChat,
                        );
                        ensureChatInActiveChats(queryClient, recoveredChat);
                        syncChatToListCaches(queryClient, recoveredChat);
                        nextBaseMessages = Array.isArray(
                            recoveredChat?.messages,
                        )
                            ? recoveredChat.messages
                            : baseMessages;
                    }

                    nextPendingUserMessage = serviceUnavailable
                        ? optimisticUserMessage
                        : null;
                } else {
                    restoreOptimisticSendCache(
                        queryClient,
                        optimisticCacheSnapshot,
                    );
                    nextBaseMessages = Array.isArray(
                        optimisticCacheSnapshot?.previousChat?.messages,
                    )
                        ? optimisticCacheSnapshot.previousChat.messages
                        : baseMessages;
                    if (serviceUnavailable) {
                        nextPendingUserMessage = optimisticUserMessage;
                    }
                }

                setDraftPair({
                    baseMessages: nextBaseMessages,
                    userMessage: nextPendingUserMessage,
                    assistantMessage: errorAssistantMessage,
                    isStreaming: false,
                    ...(serviceUnavailable
                        ? {}
                        : {
                              localOnlyError: true,
                          }),
                });
            }
        },
        [
            chat,
            chatId,
            effectiveChatId,
            getMessagePayload,
            getModelMessageContent,
            updateChatHook,
            addMessage,
            handleError,
            t,
            clearStreamingState,
            streamingChatId,
            queryClient,
            setIsStreaming,
            setSubscriptionId,
            selectedEntityIdFromProp,
            user,
            entities,
            pathname,
            contextualTools,
            pageContext,
            pageContextGetter,
            canvasContent,
            resolvedAgentModel,
            persistResolvedAgentModel,
            displayedMessages,
            userSkills,
            isRTL,
        ],
    );

    // Handle injecting a user message into a running agent loop.
    // The UI waits for the stream to echo a matching toolMessage event
    // so the persisted and live views stay in sync.
    const handleInjectMessage = useCallback(
        async (messageText) => {
            const requestId = chat?.activeSubscriptionId;
            if (!requestId || !messageText) return;

            // Inject into the backend agent loop
            try {
                await client.mutate({
                    mutation: MUTATIONS.INJECT_AGENT_MESSAGE,
                    variables: {
                        requestId: String(requestId),
                        message: messageText,
                    },
                });
            } catch (error) {
                console.error("Failed to inject message:", error);
                toast.error(t("Failed to send message to agent"));
            }
        },
        [chat?.activeSubscriptionId, client, t],
    );

    // Stable callback wrappers — always the same reference, always call latest version.
    // Prevents ChatMessages (React.memo) from re-rendering on callback identity changes.
    const stableHandleSend = useStableCallback(handleSend);
    const stableStopStreaming = useStableCallback(handleStopStreaming);
    const stableInjectMessage = useStableCallback(handleInjectMessage);
    const stableLoadOlder = useStableCallback(loadOlderMessages);

    useEffect(() => {
        if (
            !isServiceUnavailable ||
            !pendingRetrySend ||
            isStreaming ||
            isWaitingForServer
        ) {
            return;
        }

        let cancelled = false;
        const retryDelay = Math.min(
            STREAM_RETRY_INITIAL_DELAY_MS *
                2 ** Math.max(0, pendingRetrySend.retryAttempt || 0),
            STREAM_RETRY_MAX_DELAY_MS,
        );

        const timeoutId = window.setTimeout(async () => {
            try {
                const response = await fetch("/api/chat/service-status", {
                    cache: "no-store",
                });
                const payload = await response.json().catch(() => ({
                    available: response.ok,
                }));

                if (cancelled) {
                    return;
                }

                if (payload?.available === false) {
                    setPendingRetrySend((currentRetry) =>
                        currentRetry
                            ? {
                                  ...currentRetry,
                                  retryAttempt:
                                      (currentRetry.retryAttempt || 0) + 1,
                              }
                            : currentRetry,
                    );
                    return;
                }

                await stableHandleSend(
                    pendingRetrySend.sendMessage,
                    pendingRetrySend.baseMessages,
                    {
                        retryAttempt: (pendingRetrySend.retryAttempt || 0) + 1,
                    },
                );
            } catch {
                if (cancelled) {
                    return;
                }

                setPendingRetrySend((currentRetry) =>
                    currentRetry
                        ? {
                              ...currentRetry,
                              retryAttempt:
                                  (currentRetry.retryAttempt || 0) + 1,
                          }
                        : currentRetry,
                );
            }
        }, retryDelay);

        return () => {
            cancelled = true;
            window.clearTimeout(timeoutId);
        };
    }, [
        isServiceUnavailable,
        pendingRetrySend,
        isStreaming,
        isWaitingForServer,
        stableHandleSend,
    ]);

    // Reset isChatLoading when navigating into a stale chat that was left loading
    // but has no active stream or pending send (e.g., browser refresh mid-stream).
    useEffect(() => {
        if (
            chat?.isChatLoading &&
            !chat?.activeSubscriptionId &&
            !chat?.toolCallbackName &&
            !chat?.toolCallbackId &&
            !isStreaming
        ) {
            const sendingTs = queryClient.getQueryData([
                "chatSending",
                String(chat._id),
            ]);
            if (sendingTs && Date.now() - sendingTs < 15000) return;

            updateChatHook.mutate({
                chatId: String(chat._id),
                isChatLoading: false,
                selectedEntityId: selectedEntityIdFromProp,
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        chat?._id,
        chat?.isChatLoading,
        chat?.activeSubscriptionId,
        isStreaming,
    ]);

    // Listen for custom events to auto-send messages (e.g., from workspace applet creation)
    useEffect(() => {
        const handleAutoSendMessage = (event) => {
            const message = event.detail?.message;
            if (message && typeof stableHandleSend === "function") {
                stableHandleSend(message);
            }
        };

        window.addEventListener("sendChatMessage", handleAutoSendMessage);
        return () => {
            window.removeEventListener(
                "sendChatMessage",
                handleAutoSendMessage,
            );
        };
    }, [stableHandleSend]);

    // Focus chat input when triggered
    useEffect(() => {
        if (focusTrigger && chatMessagesRef.current) {
            chatMessagesRef.current.focusInput();
        }
    }, [focusTrigger]);

    // Listen for create applet confirmation requests
    useEffect(() => {
        const handleConfirmationRequest = (event) => {
            const { confirmationId, name } = event.detail;
            setCreateAppletDialog({
                open: true,
                confirmationId,
                name: name || "New Applet",
            });
        };

        window.addEventListener(
            "createappletConfirmationRequest",
            handleConfirmationRequest,
        );

        return () => {
            window.removeEventListener(
                "createappletConfirmationRequest",
                handleConfirmationRequest,
            );
        };
    }, []);

    const handleCreateAppletConfirm = useCallback(() => {
        const { confirmationId } = createAppletDialog;

        // Dispatch confirmation result
        window.dispatchEvent(
            new CustomEvent("createappletConfirmationResult", {
                detail: {
                    confirmationId,
                    confirmed: true,
                },
            }),
        );

        // Close dialog
        setCreateAppletDialog({
            open: false,
            confirmationId: null,
            name: null,
        });
    }, [createAppletDialog]);

    const handleCreateAppletCancel = useCallback(() => {
        const { confirmationId } = createAppletDialog;

        // Dispatch cancellation result
        window.dispatchEvent(
            new CustomEvent("createappletConfirmationResult", {
                detail: {
                    confirmationId,
                    confirmed: false,
                },
            }),
        );

        // Close dialog
        setCreateAppletDialog({
            open: false,
            confirmationId: null,
            name: null,
        });
    }, [createAppletDialog]);

    if (instantOnly) {
        return (
            <div
                data-testid="chat-messages"
                data-streaming="false"
                className="flex flex-col h-full"
            >
                <div data-testid="chat-message-list" className="grow" />
                <MessageInput
                    chatId={effectiveChatId}
                    onSend={stableHandleSend}
                    loading={isChatLoading}
                    sendBlocked={isSendBlocked}
                    viewingReadOnlyChat={viewingReadOnlyChat}
                    isStreaming={isStreaming}
                    onStopStreaming={stableStopStreaming}
                    onInjectMessage={stableInjectMessage}
                    onCopyAndContinue={onCopyAndContinue}
                    copyInProgress={copyInProgress}
                />
            </div>
        );
    }

    return (
        <>
            <ChatMessages
                ref={chatMessagesRef}
                viewingReadOnlyChat={viewingReadOnlyChat}
                publicChatOwner={publicChatOwner}
                loading={isChatLoading}
                sendBlocked={isSendBlocked}
                onSend={stableHandleSend}
                chat={chat}
                messages={renderBaseMessages}
                pendingUserMessage={pendingUserMessage}
                pendingAssistantMessage={pendingAssistantMessage}
                waitingForServer={isWaitingForServer}
                container={container}
                displayState={displayState}
                chatId={effectiveChatId}
                isStreaming={isStreaming}
                onStopStreaming={stableStopStreaming}
                onInjectMessage={stableInjectMessage}
                selectedEntityId={selectedEntityIdFromProp}
                entities={entities}
                entityIconSize={entityIconSize}
                contextId={user?.contextId}
                contextKey={user?.contextKey}
                updateChatHook={updateChatHook}
                onLoadOlder={stableLoadOlder}
                hasMoreMessages={hasMoreMessages}
                isLoadingOlder={isLoadingOlder}
                onCopyAndContinue={onCopyAndContinue}
                copyInProgress={copyInProgress}
            />

            <AlertDialog
                open={toolConfirmDialog.open}
                onOpenChange={(open) => {
                    if (!open) {
                        resolveToolConfirm(false);
                    }
                }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader className={isRTL ? "text-right" : ""}>
                        <AlertDialogTitle>
                            {toolConfirmDialog.title}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {toolConfirmDialog.description}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter
                        className={
                            isRTL ? "flex-row-reverse sm:flex-row-reverse" : ""
                        }
                    >
                        <AlertDialogCancel
                            onClick={() => resolveToolConfirm(false)}
                        >
                            {toolConfirmDialog.cancelLabel}
                        </AlertDialogCancel>
                        <AlertDialogAction
                            className={
                                toolConfirmDialog.destructive
                                    ? "bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-500"
                                    : undefined
                            }
                            onClick={() => resolveToolConfirm(true)}
                        >
                            {toolConfirmDialog.confirmLabel}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Create Applet Confirmation Dialog */}
            <AlertDialog
                open={createAppletDialog.open}
                onOpenChange={(open) => {
                    if (!open) {
                        handleCreateAppletCancel();
                    }
                }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {t("Create New Applet?")}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {t(
                                'Would you like to create a new applet named "{{name}}"?',
                                {
                                    name: createAppletDialog.name,
                                },
                            )}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={handleCreateAppletCancel}>
                            {t("Cancel")}
                        </AlertDialogCancel>
                        <AlertDialogAction onClick={handleCreateAppletConfirm}>
                            {t("Create")}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}

export default React.memo(ChatContent);
