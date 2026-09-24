import { useTranslation } from "react-i18next";
import { FileText } from "lucide-react";
import { useContext, useState } from "react";
import { AuthContext } from "../../App";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import UserFileCollection from "../../../app/workspaces/[id]/components/UserFileCollection";
import { dispatchChatFileAttach } from "./fileCollectionAttachments";
import { cn } from "@/lib/utils";

function ChatTopMenu({
    displayState = "full",
    readOnly = false,
    chat = null,
    contextId = null,
    contextKey = null,
    updateChatHook = null,
    buttonClassName,
}) {
    const { t } = useTranslation();
    const { user } = useContext(AuthContext);
    const activeChatId = chat?._id;
    const [showFileCollectionDialog, setShowFileCollectionDialog] =
        useState(false);
    const showLabel = displayState !== "docked";
    const resolvedContextId = contextId || user?.contextId;
    const resolvedContextKey = contextKey || user?.contextKey;
    const handleAttachFiles = (selectedObjects) => {
        if (!activeChatId || readOnly) return;
        dispatchChatFileAttach({
            chatId: String(activeChatId),
            files: selectedObjects,
        });
        setShowFileCollectionDialog(false);
    };

    return (
        <>
            <div className="flex justify-center rounded-md items-center px-0 text-xs [.docked_&]:flex gap-2">
                <button
                    onClick={() => setShowFileCollectionDialog(true)}
                    disabled={readOnly}
                    className={cn(
                        "flex items-center justify-center gap-2 px-3 py-1.5 rounded-md transition-colors border bg-sky-50 dark:bg-sky-900/20 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800 hover:bg-sky-100 dark:hover:bg-sky-900/30 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-sky-50 dark:disabled:hover:bg-sky-900/20",
                        buttonClassName,
                    )}
                    title={
                        readOnly ? t("Read-only mode") : t("View Chat Files")
                    }
                >
                    <FileText className="w-4 h-4" />
                    {showLabel ? (
                        <span className="text-xs font-semibold">
                            {t("Files")}
                        </span>
                    ) : null}
                </button>
            </div>

            <Dialog
                open={showFileCollectionDialog}
                onOpenChange={setShowFileCollectionDialog}
            >
                <DialogContent className="left-0 top-0 flex h-[100dvh] w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 p-0 sm:left-[50%] sm:top-[50%] sm:h-[90vh] sm:w-[calc(100vw-2rem)] sm:max-w-5xl sm:translate-x-[-50%] sm:translate-y-[-50%] sm:gap-4 sm:rounded-lg sm:border sm:p-6">
                    <DialogHeader className="flex-shrink-0 px-4 pb-3 pt-12 text-start sm:px-0 sm:pb-0 sm:pt-0">
                        <DialogTitle>{t("Chat Files")}</DialogTitle>
                        <DialogDescription>
                            {t(
                                "View and manage files that are available to this conversation.",
                            )}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="min-h-0 flex-1 px-4 pb-4 sm:px-0 sm:pb-0">
                        {resolvedContextId && (
                            <UserFileCollection
                                contextId={resolvedContextId}
                                contextKey={resolvedContextKey}
                                chatId={
                                    activeChatId ? String(activeChatId) : null
                                }
                                messages={chat?.messages || []}
                                updateChatHook={updateChatHook}
                                containerHeight="100%"
                                onAttach={handleAttachFiles}
                            />
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}

export default ChatTopMenu;
