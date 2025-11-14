"use client";
import { useQuery, useApolloClient } from "@apollo/client";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { X, Trash2, FileText, ExternalLink } from "lucide-react";
import { QUERIES } from "@/src/graphql";
import { getFileIcon } from "@/src/utils/mediaUtils";
import {
    saveMemoryFiles as saveMemoryFilesUtil,
    matchesFile,
    getFileUrl,
    getFilename as getFilenameUtil,
} from "./memoryFilesUtils";
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

export default function MemoryFiles({
    contextId,
    contextKey,
    chatId = null,
    messages = [],
    updateChatHook = null,
}) {
    const { t } = useTranslation();
    const apolloClient = useApolloClient();
    const [memoryFiles, setMemoryFiles] = useState([]);
    const [showRemoveAllConfirm, setShowRemoveAllConfirm] = useState(false);
    const [removingFile, setRemovingFile] = useState(null);

    const {
        data: memoryData,
        loading: memoryLoading,
        refetch: refetchMemory,
    } = useQuery(QUERIES.SYS_READ_MEMORY, {
        variables: { contextId, contextKey, section: "memoryFiles" },
        skip: !contextId,
        fetchPolicy: "network-only",
    });

    useEffect(() => {
        if (memoryData?.sys_read_memory?.result) {
            try {
                const files = JSON.parse(memoryData.sys_read_memory.result);
                setMemoryFiles(Array.isArray(files) ? files : []);
            } catch (e) {
                console.error("[MemoryFiles] Error parsing memory:", e);
                setMemoryFiles([]);
            }
        } else {
            setMemoryFiles([]);
        }
    }, [memoryData]);

    const saveMemoryFiles = async (files) => {
        try {
            await saveMemoryFilesUtil(
                apolloClient,
                contextId,
                contextKey,
                files,
            );
            // Refetch to update UI
            refetchMemory();
        } catch (error) {
            console.error("Failed to save memory files:", error);
        }
    };

    const handleRemoveFile = async (fileIndex) => {
        const fileToRemove = memoryFiles[fileIndex];
        const newFiles = memoryFiles.filter((_, index) => index !== fileIndex);
        setRemovingFile(null);

        // Also remove from chat messages if chatId and updateChatHook are provided
        if (chatId && updateChatHook && fileToRemove && messages.length > 0) {
            try {
                const updatedMessages = messages.map((message) => {
                    if (!Array.isArray(message.payload)) return message;

                    const updatedPayload = message.payload.map(
                        (payloadItem) => {
                            try {
                                const fileObj = JSON.parse(payloadItem);
                                if (matchesFile(fileToRemove, fileObj)) {
                                    // Replace with placeholder
                                    return JSON.stringify({
                                        type: "text",
                                        text: t(
                                            "File deleted by user: {{filename}}",
                                            {
                                                filename:
                                                    fileToRemove.filename ||
                                                    "file",
                                            },
                                        ),
                                        hideFromClient: true,
                                    });
                                }
                            } catch (e) {
                                // Not a JSON object, keep as is
                            }
                            return payloadItem;
                        },
                    );

                    return {
                        ...message,
                        payload: updatedPayload,
                    };
                });

                await updateChatHook.mutateAsync({
                    chatId: String(chatId),
                    messages: updatedMessages,
                });
            } catch (error) {
                console.error("Failed to remove file from messages:", error);
            }
        }

        await saveMemoryFiles(newFiles);
    };

    const handleRemoveAll = async () => {
        setShowRemoveAllConfirm(false);

        // Also remove all files from chat messages if chatId and updateChatHook are provided
        if (
            chatId &&
            updateChatHook &&
            memoryFiles.length > 0 &&
            messages.length > 0
        ) {
            try {
                const updatedMessages = messages.map((message) => {
                    if (!Array.isArray(message.payload)) return message;

                    const updatedPayload = message.payload.map(
                        (payloadItem) => {
                            try {
                                const fileObj = JSON.parse(payloadItem);
                                // Check if this file matches any of the memoryFiles
                                const matchesAnyFile = memoryFiles.some(
                                    (memFile) => matchesFile(memFile, fileObj),
                                );

                                if (matchesAnyFile) {
                                    // Replace with placeholder
                                    return JSON.stringify({
                                        type: "text",
                                        text: t(
                                            "File deleted by user: {{filename}}",
                                            {
                                                filename:
                                                    fileObj.originalFilename ||
                                                    "file",
                                            },
                                        ),
                                        hideFromClient: true,
                                    });
                                }
                            } catch (e) {
                                // Not a JSON object, keep as is
                            }
                            return payloadItem;
                        },
                    );

                    return {
                        ...message,
                        payload: updatedPayload,
                    };
                });

                await updateChatHook.mutateAsync({
                    chatId: String(chatId),
                    messages: updatedMessages,
                });
            } catch (error) {
                console.error("Failed to remove files from messages:", error);
            }
        }

        await saveMemoryFiles([]);
    };

    // Show loading state
    if (memoryLoading) {
        return (
            <div className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
                {t("Loading chat files...")}
            </div>
        );
    }

    // Show message if no files
    if (memoryFiles.length === 0) {
        return (
            <div className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
                {t("No files indexed in this conversation yet.")}
            </div>
        );
    }

    // Helper to handle file open/view
    const handleOpenFile = (file, e) => {
        e.stopPropagation();
        const url = getFileUrl(file);
        if (url) {
            window.open(url, "_blank", "noopener,noreferrer");
        }
    };

    return (
        <>
            <div className="space-y-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <FileText className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                        <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                            {t("Files indexed in this conversation")}
                        </h3>
                        <span className="text-sm text-gray-500 dark:text-gray-400">
                            ({memoryFiles.length})
                        </span>
                    </div>
                    {memoryFiles.length > 0 && (
                        <button
                            onClick={() => setShowRemoveAllConfirm(true)}
                            className="text-sm text-gray-600 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400 flex items-center gap-1.5 px-3 py-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                            title={t("Remove all files")}
                        >
                            <Trash2 className="w-4 h-4" />
                            {t("Remove All")}
                        </button>
                    )}
                </div>
                <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                    {memoryFiles.map((file, index) => {
                        const filename = getFilenameUtil(file);
                        const fileId =
                            typeof file === "object" ? file.id : null;
                        const fileUrl = getFileUrl(file);
                        const Icon = getFileIcon(filename);

                        return (
                            <div
                                key={fileId || index}
                                className="flex items-center justify-between group p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                            >
                                <div className="flex items-center gap-3 flex-1 min-w-0">
                                    <Icon className="w-5 h-5 text-sky-600 dark:text-sky-400 flex-shrink-0" />
                                    <span
                                        className="text-sm text-gray-700 dark:text-gray-300 truncate flex-1"
                                        title={fileUrl || filename}
                                    >
                                        {filename}
                                    </span>
                                </div>
                                <div className="flex items-center gap-1 flex-shrink-0">
                                    {fileUrl && (
                                        <button
                                            onClick={(e) =>
                                                handleOpenFile(file, e)
                                            }
                                            className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-500 hover:text-sky-600 dark:text-gray-400 dark:hover:text-sky-400 p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-600"
                                            title={t("Open file")}
                                        >
                                            <ExternalLink className="w-4 h-4" />
                                        </button>
                                    )}
                                    <button
                                        onClick={() => setRemovingFile(index)}
                                        className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400 p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-600"
                                        title={t("Remove file")}
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Remove single file confirmation */}
            <AlertDialog
                open={removingFile !== null}
                onOpenChange={(open) => !open && setRemovingFile(null)}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{t("Remove File?")}</AlertDialogTitle>
                        <AlertDialogDescription>
                            {t(
                                "Are you sure you want to remove this file from memory? This action cannot be undone.",
                            )}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    {removingFile !== null && (
                        <div className="mt-2 p-2 bg-gray-100 dark:bg-gray-700 rounded text-xs font-mono">
                            {getFilenameUtil(memoryFiles[removingFile])}
                        </div>
                    )}
                    <AlertDialogFooter>
                        <AlertDialogCancel>{t("Cancel")}</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => handleRemoveFile(removingFile)}
                        >
                            {t("Remove")}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Remove all files confirmation */}
            <AlertDialog
                open={showRemoveAllConfirm}
                onOpenChange={setShowRemoveAllConfirm}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {t("Remove All Files?")}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {t(
                                "Are you sure you want to remove all files from memory? This action cannot be undone.",
                            )}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>{t("Cancel")}</AlertDialogCancel>
                        <AlertDialogAction onClick={handleRemoveAll}>
                            {t("Remove All")}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
