"use client";

import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { useDispatch, useSelector } from "react-redux";
import HomeFullscreenDialog from "./HomeFullscreenDialog";
import { CurrentUserContext } from "@/src/App.js";
import { cn } from "@/lib/utils";
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
import {
    appCatalogActionButtonClass,
    appCatalogDangerActionButtonClass,
} from "@/src/components/apps/AppCatalogCard";
import ChatContent from "@/src/components/chat/ChatContent";
import Canvas from "@/src/components/chat/Canvas";
import { usePageContext } from "@/src/contexts/PageContextProvider";
import { useEntities } from "@/src/hooks/useEntities";
import {
    CHAT_CONTEXTUAL_TOOLS,
    CHAT_TOOL_HANDLERS,
} from "../../chat/chatTools";
import {
    useAddChat,
    useGetActiveChat,
    useGetChatById,
    useGetUserChatInfo,
    useSetActiveChatId,
    useUpdateChat,
} from "../../queries/chats";
import {
    openCanvas,
    setActiveCanvasChat,
    setChatBoxPosition,
} from "@/src/stores/chatSlice";
import { getTextProxyUrl } from "@/src/utils/proxyUrl";

async function resolveAppletHtml(applet) {
    if (applet?.filePath) {
        const response = await fetch(getTextProxyUrl(applet.filePath));
        if (response.ok) {
            return response.text();
        }
    }
    if (applet?.html) return applet.html;
    const versions = applet?.htmlVersions;
    if (Array.isArray(versions) && versions.length > 0) {
        return versions[versions.length - 1].content || "";
    }
    return "";
}

export default function HomeModifyAppletDialog({
    applet,
    viewMode = "widget",
    onClose,
    t,
}) {
    const dispatch = useDispatch();
    const { setPageContext, clearPageContext } = usePageContext();
    const user = useContext(CurrentUserContext);
    const appletId = applet?.appletId ? String(applet.appletId) : null;
    const title = applet?.name || t("Untitled app");
    const chatBoxPosition = useSelector(
        (state) => state.chat?.chatBox?.position,
    );
    const savedChatBoxPositionRef = useRef(chatBoxPosition || "closed");
    const boundChatIdRef = useRef(null);
    const lastChatRef = useRef(null);
    const prevAppletIdRef = useRef(appletId);

    const { data: chatInfo, isFetched: chatInfoFetched } = useGetUserChatInfo();
    const activeChatId = chatInfo?.activeChatId;
    const {
        data: activeChat,
        isFetched: chatFetched,
        isError: chatError,
    } = useGetActiveChat();
    const addChat = useAddChat();
    const setActiveChatId = useSetActiveChatId();
    const updateChat = useUpdateChat();
    const [boundChatId, setBoundChatId] = useState(null);
    const [createdChat, setCreatedChat] = useState(null);
    const [localCleared, setLocalCleared] = useState(false);
    const [error, setError] = useState(null);
    const [isOpening, setIsOpening] = useState(true);
    const [showClearConfirm, setShowClearConfirm] = useState(false);
    const chatReady =
        chatInfoFetched && (!activeChatId || chatFetched || chatError);
    const { data: liveChat } = useGetChatById(boundChatId, {
        notifyOnChangeProps: ["data"],
    });
    const fallbackActiveChat =
        activeChat?._id &&
        boundChatId &&
        String(activeChat._id) === String(boundChatId)
            ? activeChat
            : null;
    const candidateChat =
        liveChat || lastChatRef.current || createdChat || fallbackActiveChat;
    if (candidateChat) {
        lastChatRef.current = candidateChat;
    }
    const sourceChat = candidateChat;
    const chat =
        sourceChat && localCleared
            ? { ...sourceChat, messages: [], title: "" }
            : sourceChat;
    const hasMessages =
        Array.isArray(chat?.messages) && chat.messages.length > 0;

    const defaultAiName = user?.aiName || "Concierge";
    const { entities, defaultEntityId } = useEntities(defaultAiName, {
        userId: user?.contextId,
        personalEntityId: user?.personalEntityId,
    });
    const selectedEntityId = useMemo(
        () => chat?.selectedEntityId || defaultEntityId || "",
        [chat?.selectedEntityId, defaultEntityId],
    );

    useEffect(() => {
        setPageContext(
            CHAT_CONTEXTUAL_TOOLS,
            null,
            CHAT_TOOL_HANDLERS,
            null,
            "home-modify-applet",
        );
        return () => clearPageContext("home-modify-applet");
    }, [clearPageContext, setPageContext]);

    useEffect(() => {
        savedChatBoxPositionRef.current = chatBoxPosition || "closed";
        dispatch(setChatBoxPosition({ position: "closed" }));
        return () => {
            const previous = savedChatBoxPositionRef.current;
            if (previous && previous !== "closed") {
                dispatch(setChatBoxPosition({ position: previous }));
            }
        };
        // Close the floating ChatBox only while this editor is open so we
        // do not mount two copies of the same ChatContent.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dispatch]);

    useEffect(() => {
        if (prevAppletIdRef.current === appletId) return;
        prevAppletIdRef.current = appletId;
        boundChatIdRef.current = null;
        lastChatRef.current = null;
        setBoundChatId(null);
        setCreatedChat(null);
        setLocalCleared(false);
        setIsOpening(true);
        setError(null);
    }, [appletId]);

    useEffect(() => {
        if (!appletId || !chatReady) return undefined;
        let cancelled = false;
        let finished = false;

        const openEditor = async () => {
            if (boundChatIdRef.current) return;
            setIsOpening(true);
            setError(null);
            try {
                let nextChat = activeChat;
                if (!nextChat?._id) {
                    nextChat = await addChat.mutateAsync({
                        messages: [],
                        title,
                    });
                    if (nextChat?._id) {
                        await setActiveChatId.mutateAsync({
                            activeChatId: String(nextChat._id),
                        });
                    }
                }
                if (cancelled) return;
                if (!nextChat?._id) {
                    throw new Error(t("Generation failed"));
                }

                const chatId = String(nextChat._id);
                boundChatIdRef.current = chatId;
                setBoundChatId(chatId);
                setCreatedChat(nextChat);

                let resolved = applet || {};
                const appletRes = await fetch(
                    `/api/canvas-applets/${appletId}`,
                );
                if (appletRes.ok) {
                    resolved = await appletRes.json();
                }
                const htmlContent = await resolveAppletHtml(resolved);
                if (cancelled) return;

                dispatch(setActiveCanvasChat(chatId));
                dispatch(
                    openCanvas({
                        type: "html",
                        title:
                            resolved.name || applet?.name || t("Untitled app"),
                        htmlContent: htmlContent || undefined,
                        url: resolved.filePath || undefined,
                        appletId,
                        workspacePath: resolved.workspacePath || null,
                        fileHash: resolved.fileHash || null,
                        blobPath: resolved.fileBlobPath || null,
                        appletViewMode: viewMode,
                    }),
                );
                finished = true;
            } catch (err) {
                if (!cancelled) {
                    setError(
                        err?.message ||
                            t("Couldn't load this app. Please try again."),
                    );
                }
            } finally {
                if (!cancelled) setIsOpening(false);
            }
        };

        openEditor();
        return () => {
            cancelled = true;
            // Strict Mode remounts this effect. Only keep the bound id if
            // openCanvas already ran so a cancelled first pass can retry.
            if (!finished) {
                boundChatIdRef.current = null;
            }
        };
        // Bind the editor once after chat info settles. Do not re-run when
        // the live chat object updates (new messages) or the thread vanishes.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [appletId, chatReady]);

    const handleDone = () => {
        onClose();
    };

    useEffect(() => {
        if ((liveChat?.messages?.length || 0) > 0) {
            setLocalCleared(false);
        }
    }, [liveChat?.messages]);

    const handleClearChat = () => {
        if (chat?._id) {
            updateChat.mutate({
                chatId: chat._id,
                messages: [],
                title: "",
            });
            setLocalCleared(true);
        }
        setShowClearConfirm(false);
    };

    return (
        <HomeFullscreenDialog
            title={`${t("Edit")}: ${title}`}
            onClose={handleDone}
            testId="home-modify-applet-dialog"
            actions={
                <button
                    type="button"
                    className={cn(
                        appCatalogActionButtonClass,
                        appCatalogDangerActionButtonClass,
                    )}
                    onClick={() => setShowClearConfirm(true)}
                    disabled={!hasMessages}
                    title={t("Clear chat")}
                    data-testid="home-modify-applet-clear-chat"
                >
                    <Trash2 className="h-4 w-4" />
                    {t("Clear chat")}
                </button>
            }
        >
            {error ? (
                <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
                    {error}
                </div>
            ) : null}

            <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
                <div
                    className="flex min-h-[36%] min-w-0 w-full flex-col overflow-hidden border-b border-gray-200 p-3 sm:h-auto sm:w-[min(22rem,34%)] sm:flex-none sm:border-b-0 sm:border-e sm:p-4 dark:border-gray-700"
                    data-testid="home-modify-applet-chat"
                >
                    {chat?._id ? (
                        <ChatContent
                            key={`home-modify:${String(chat._id)}`}
                            chat={chat}
                            urlChatId={String(chat._id)}
                            selectedEntityId={selectedEntityId}
                            entities={entities}
                            entityIconSize="lg"
                        />
                    ) : (
                        <div className="flex h-full items-center justify-center text-sm text-gray-500 dark:text-gray-400">
                            <Loader2 className="me-2 h-4 w-4 animate-spin" />
                            {t("Loading...")}
                        </div>
                    )}
                </div>
                <div
                    className="min-h-[50%] min-w-0 flex-1 overflow-hidden"
                    data-testid="home-modify-applet-canvas"
                >
                    {isOpening ? (
                        <div className="flex h-full items-center justify-center text-sm text-gray-500 dark:text-gray-400">
                            <Loader2 className="me-2 h-4 w-4 animate-spin" />
                            {t("Loading...")}
                        </div>
                    ) : (
                        <Canvas
                            selectedEntityId={selectedEntityId}
                            editorLayout="applet-editor"
                        />
                    )}
                </div>
            </div>

            <AlertDialog
                open={showClearConfirm}
                onOpenChange={setShowClearConfirm}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{t("Clear Chat?")}</AlertDialogTitle>
                        <AlertDialogDescription>
                            {t(
                                "Are you sure you want to clear this chat? This action cannot be undone.",
                            )}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>{t("Cancel")}</AlertDialogCancel>
                        <AlertDialogAction
                            autoFocus
                            onClick={handleClearChat}
                            data-testid="home-modify-applet-clear-chat-confirm"
                        >
                            {t("Clear")}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </HomeFullscreenDialog>
    );
}
