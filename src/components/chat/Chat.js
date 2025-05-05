"use client";

import { useTranslation } from "react-i18next";
import ChatContent from "./ChatContent";
import dynamic from "next/dynamic";
import {
    useUpdateActiveChat,
    useGetActiveChat,
} from "../../../app/queries/chats";
import { useContext, useState, useEffect } from "react";
import { AuthContext } from "../../App";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import EntityIcon from "./EntityIcon";
import { User, Share, Trash2, Check } from "lucide-react";
import { useEntities } from "../../hooks/useEntities";
import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogAction,
    AlertDialogCancel,
} from "@/components/ui/alert-dialog";

const ChatTopMenuDynamic = dynamic(() => import("./ChatTopMenu"), {
    loading: () => <div style={{ width: "80px", height: "20px" }}></div>,
});

function Chat({ viewingChat = null }) {
    const { t } = useTranslation();
    const updateActiveChat = useUpdateActiveChat();
    const { data: chat } = useGetActiveChat();
    const activeChatId = chat?._id;
    const { user } = useContext(AuthContext);
    const { readOnly } = viewingChat || {};
    const publicChatOwner = viewingChat?.owner;
    const [selectedEntityId, setSelectedEntityId] = useState(
        chat?.selectedEntityId || "",
    );
    const [showPublicConfirm, setShowPublicConfirm] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [copyStatus, setCopyStatus] = useState(false);

    const defaultAiName = user?.aiName || "Labeeb";
    const { entities, defaultEntityId } = useEntities(defaultAiName);

    // Sync local state with fetched chat data
    useEffect(() => {
        const entityIdFromChat = chat?.selectedEntityId || "";
        // If no entityId or entity doesn't exist, use default entity
        const newEntityId =
            entityIdFromChat && entities.some((e) => e.id === entityIdFromChat)
                ? entityIdFromChat
                : defaultEntityId;

        if (newEntityId !== selectedEntityId) {
            setSelectedEntityId(newEntityId);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [chat?.selectedEntityId, entities, defaultEntityId]);

    const handleShareOrCopy = async () => {
        const shareUrl = `${window.location.origin}/chat/${chat._id}`;

        if (chat?.isPublic) {
            await navigator.clipboard.writeText(shareUrl);
            setCopyStatus(true);
            setTimeout(() => setCopyStatus(false), 2000);
        } else {
            setShowPublicConfirm(true);
        }
    };

    const handleEntityChange = (value) => {
        const newEntityId = value === defaultAiName ? "" : value;
        setSelectedEntityId(newEntityId);
        if (activeChatId) {
            updateActiveChat.mutate({
                chatId: activeChatId,
                selectedEntityId: newEntityId,
            });
        }
    };

    const handleMakePublic = async () => {
        try {
            const shareUrl = `${window.location.origin}/chat/${chat._id}`;
            await updateActiveChat.mutateAsync({ isPublic: true });
            document.body.focus();
            await navigator.clipboard.writeText(shareUrl);
            setCopyStatus(true);
            setTimeout(() => setCopyStatus(false), 2000);
        } catch (error) {
            console.error("Error making chat public:", error);
        }
    };

    const handleDelete = async () => {
        try {
            if (activeChatId) {
                updateActiveChat.mutate({
                    chatId: activeChatId,
                    messages: [],
                    title: "",
                });
            }
        } catch (error) {
            console.error("Error deleting chat:", error);
        }
    };

    return (
        <div className="flex flex-col gap-3 h-full">
            <div className="flex justify-between items-center">
                <ChatTopMenuDynamic />
                {publicChatOwner && (
                    <div className="text-sm font-medium text-gray-600 bg-gray-100 px-3 py-1 rounded shadow-sm">
                        {t("Shared by")}{" "}
                        <span className="font-bold text-blue-600">
                            {publicChatOwner.name || publicChatOwner.username}
                        </span>
                    </div>
                )}
                <div className="flex gap-2 items-center">
                    <Select
                        value={selectedEntityId || defaultAiName}
                        onValueChange={handleEntityChange}
                        disabled={readOnly}
                    >
                        <SelectTrigger
                            className={`w-auto text-sm h-7 lb-outline ${readOnly ? "cursor-not-allowed opacity-50" : ""}`}
                            aria-label={t("Select entity")}
                        >
                            <div className="flex items-center gap-2">
                                <User className="w-4 h-4 text-gray-500" />
                                {selectedEntityId ? (
                                    <EntityIcon
                                        entity={entities.find(
                                            (e) => e.id === selectedEntityId,
                                        )}
                                        size="xs"
                                    />
                                ) : (
                                    <SelectValue
                                        placeholder={t("Select entity")}
                                    />
                                )}
                            </div>
                        </SelectTrigger>
                        <SelectContent>
                            {entities.map((entity) => (
                                <SelectItem
                                    className="text-sm"
                                    key={entity.id}
                                    value={entity.id}
                                >
                                    <div className="flex items-center gap-2">
                                        <EntityIcon entity={entity} size="xs" />
                                        {t(entity.name)}
                                    </div>
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <button
                        disabled={readOnly}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-md transition-colors border bg-white text-gray-700 border-gray-200 hover:bg-gray-100 text-xs"
                        onClick={handleShareOrCopy}
                        title={
                            chat?.isPublic ? t("Copy Share URL") : t("Share")
                        }
                    >
                        {copyStatus ? (
                            <Check className="w-4 h-4 text-green-500" />
                        ) : (
                            <Share className="w-4 h-4" />
                        )}
                        <span className="hidden sm:inline">
                            {chat?.isPublic ? t("Copy Share URL") : t("Share")}
                        </span>
                    </button>
                    <button
                        disabled={readOnly}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-md transition-colors border bg-white text-gray-700 border-gray-200 hover:bg-gray-100 text-xs"
                        onClick={() => {
                            setShowDeleteConfirm(true);
                        }}
                        title={t("Clear this chat")}
                    >
                        <Trash2 className="w-4 h-4" />
                        <span className="hidden sm:inline">
                            {t("Clear this chat")}
                        </span>
                    </button>
                </div>
            </div>
            <div className="grow overflow-auto">
                <ChatContent
                    viewingChat={viewingChat}
                    streamingEnabled={user.streamingEnabled}
                    selectedEntityId={selectedEntityId}
                    entities={entities}
                    entityIconSize="lg"
                />
            </div>

            <AlertDialog
                open={showPublicConfirm}
                onOpenChange={setShowPublicConfirm}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {t("Make this chat public?")}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {t(
                                "This will make this chat visible to anyone with the link. This action cannot be undone.",
                            )}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>{t("Cancel")}</AlertDialogCancel>
                        <AlertDialogAction
                            autoFocus
                            onClick={() => {
                                handleMakePublic();
                                setShowPublicConfirm(false);
                            }}
                        >
                            {t("Make Public")}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <AlertDialog
                open={showDeleteConfirm}
                onOpenChange={setShowDeleteConfirm}
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
                            onClick={() => {
                                handleDelete();
                                setShowDeleteConfirm(false);
                            }}
                        >
                            {t("Clear")}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}

export default Chat;
