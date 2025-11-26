import { useTranslation } from "react-i18next";
import { Microscope, FileText } from "lucide-react";
import { useContext, useState, useEffect } from "react";
import { AuthContext } from "../../App";
import { useGetActiveChat, useUpdateChat } from "../../../app/queries/chats";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import MemoryFiles from "@/app/workspaces/[id]/components/MemoryFiles";

function ChatTopMenu({ displayState = "full", readOnly = false }) {
    const { t } = useTranslation();
    const { user } = useContext(AuthContext);
    const { data: chat } = useGetActiveChat();
    const activeChatId = chat?._id;
    const updateChatHook = useUpdateChat();
    const [isResearchMode, setIsResearchMode] = useState(false);
    const [showMemoryFilesDialog, setShowMemoryFilesDialog] = useState(false);

    useEffect(() => {
        if (chat?.researchMode !== undefined) {
            setIsResearchMode(chat.researchMode);
        }
    }, [chat?.researchMode]);

    const toggleResearchMode = () => {
        const newMode = !isResearchMode;
        setIsResearchMode(newMode);
        updateChatHook.mutate({
            chatId: activeChatId,
            researchMode: newMode,
        });
    };

    return (
        <>
            <div className="flex justify-center rounded-md items-center px-0 text-xs [.docked_&]:flex gap-2">
                <button
                    onClick={toggleResearchMode}
                    disabled={readOnly}
                    className={`flex items-center justify-center px-3 py-1.5 rounded-md transition-colors border ${
                        isResearchMode
                            ? "bg-sky-500 text-white border-sky-600 hover:bg-sky-600 dark:bg-sky-600 dark:hover:bg-sky-500 dark:hover:text-white dark:border-sky-500"
                            : "bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600"
                    } disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white dark:disabled:hover:bg-gray-700`}
                    title={
                        readOnly
                            ? t("Read-only mode")
                            : t("Toggle Research Mode")
                    }
                >
                    <Microscope className="w-4 h-4" />
                </button>

                <button
                    onClick={() => setShowMemoryFilesDialog(true)}
                    disabled={readOnly}
                    className="flex items-center justify-center px-3 py-1.5 rounded-md transition-colors border bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white dark:disabled:hover:bg-gray-700"
                    title={
                        readOnly ? t("Read-only mode") : t("View Chat Files")
                    }
                >
                    <FileText className="w-4 h-4" />
                </button>
            </div>

            <Dialog
                open={showMemoryFilesDialog}
                onOpenChange={setShowMemoryFilesDialog}
            >
                <DialogContent className="max-w-2xl w-[calc(100vw-2rem)] sm:w-full overflow-hidden">
                    <DialogHeader>
                        <DialogTitle>{t("Chat Files")}</DialogTitle>
                        <DialogDescription>
                            {t(
                                "View and manage files that have been indexed in this conversation.",
                            )}
                        </DialogDescription>
                    </DialogHeader>
                    {user?.contextId && (
                        <MemoryFiles
                            contextId={user.contextId}
                            contextKey={user.contextKey}
                            chatId={activeChatId ? String(activeChatId) : null}
                            messages={chat?.messages || []}
                            updateChatHook={updateChatHook}
                        />
                    )}
                </DialogContent>
            </Dialog>
        </>
    );
}

export default ChatTopMenu;
