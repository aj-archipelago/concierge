import { useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { Popover } from "@headlessui/react";
import { Microscope, Database, Trash2 } from "lucide-react";
import { COGNITIVE_DELETE } from "../../graphql";
import { useLazyQuery } from "@apollo/client";
import { useContext, useState, useEffect } from "react";
import Loader from "../../../app/components/loader";
import { AuthContext } from "../../App";
import {
    useDeleteAllDocuments,
    useDeleteDocument,
} from "../../../app/queries/uploadedDocs";
import { useGetActiveChat } from "../../../app/queries/chats";
import { useUpdateChat } from "../../../app/queries/chats";
import { getFileIcon } from "../../utils/mediaUtils";

const DELETE_ALL_UPLOADS_STR = "__ALL__";

function ChatTopMenu({ displayState = "full" }) {
    const { t } = useTranslation();
    const { user } = useContext(AuthContext);
    const { data: chat } = useGetActiveChat();
    const activeChatId = chat?._id;
    const updateChat = useUpdateChat();
    const docs = user?.uploadedDocs?.filter(
        ({ chatId }) => chatId === activeChatId,
    );
    const deleteDocument = useDeleteDocument();
    const deleteAllDocuments = useDeleteAllDocuments();
    const contextId = user?.contextId;
    const [currentlyDeletingDocId, setCurrentlyDeletingDocId] = useState(null);
    const mainPaneIndexerLoading = useSelector(
        (state) => state.mainPaneIndexer.isLoading,
    );
    const fileUploaderLoading = useSelector(
        (state) => state.fileUpload?.isLoading,
    );
    const currentlyIndexing = fileUploaderLoading || mainPaneIndexerLoading;
    const displayStateFull = displayState === "full";
    const [isResearchMode, setIsResearchMode] = useState(false);

    useEffect(() => {
        if (chat?.researchMode !== undefined) {
            setIsResearchMode(chat.researchMode);
        }
    }, [chat?.researchMode]);

    const [cognitiveDelete, { loading: loadingCD }] = useLazyQuery(
        COGNITIVE_DELETE,
        {
            fetchPolicy: "network-only",
        },
    );

    const handleDelete = (id) => {
        setCurrentlyDeletingDocId(id);
        cognitiveDelete({ variables: { contextId, docId: id } }).then(() => {
            setCurrentlyDeletingDocId(null);
            deleteDocument.mutate({ docId: id });
        });
    };

    const handleDeleteAll = () => {
        setCurrentlyDeletingDocId(DELETE_ALL_UPLOADS_STR);
        cognitiveDelete({ variables: { contextId } }).then(() => {
            setCurrentlyDeletingDocId(null);
            deleteAllDocuments.mutate();
        });
    };

    const toggleResearchMode = () => {
        const newMode = !isResearchMode;
        setIsResearchMode(newMode);
        updateChat.mutate({
            chatId: activeChatId,
            researchMode: newMode,
        });
    };

    return (
        <div className="flex justify-center rounded-md items-center px-0 text-xs [.docked_&]:flex gap-2">
            <button
                onClick={toggleResearchMode}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-md transition-colors border ${
                    isResearchMode
                        ? "bg-sky-600 text-white border-sky-700 hover:bg-sky-700 dark:hover:bg-sky-500 dark:hover:text-white"
                        : "bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600"
                }`}
                title={t("Toggle Research Mode")}
            >
                <Microscope className="w-4 h-4" />
                <span className="hidden md:inline">{t("Research Mode")}</span>
            </button>

            {docs && docs.length > 0 && (
                <Popover className="relative">
                    {/* bg-slate-50  hover:bg-slate-300 */}
                    <Popover.Button className="flex gap-0 focus:outline-none items-center rounded-md underline hover:text-sky-500 active:text-sky-700">
                        <Database />
                        {displayStateFull
                            ? t("Files indexed in this conversation")
                            : t("Files")}{" "}
                        ({docs?.length})
                        {currentlyIndexing && (
                            <div className="px-2">
                                <Loader size="small" />
                            </div>
                        )}
                    </Popover.Button>

                    <Popover.Panel className="absolute shadow-lg z-10 bg-slate-950 p-4 rounded">
                        <div>
                            {docs?.map(({ docId: id, filename }) => {
                                const isCurrentlyGettingDeleted =
                                    loadingCD &&
                                    (currentlyDeletingDocId === id ||
                                        currentlyDeletingDocId ===
                                            DELETE_ALL_UPLOADS_STR);
                                return (
                                    <div
                                        key={id}
                                        className={`flex border justify-between items-center mx-1 my-2 py-1 px-1 rounded-md cursor-default ${isCurrentlyGettingDeleted ? "bg-red-400" : "bg-gray-100"}`}
                                    >
                                        <div className="flex gap-1 items-center">
                                            {(() => {
                                                const Icon =
                                                    getFileIcon(filename);
                                                return <Icon />;
                                            })()}
                                            <span className="text-nowrap">
                                                {isCurrentlyGettingDeleted ? (
                                                    <span
                                                        style={{
                                                            fontSize: "8px",
                                                        }}
                                                    >
                                                        {t("Deleting...")}{" "}
                                                        {filename}
                                                    </span>
                                                ) : (
                                                    filename
                                                )}
                                            </span>
                                        </div>
                                        {!isCurrentlyGettingDeleted && (
                                            <button
                                                onClick={() => handleDelete(id)}
                                            >
                                                <Trash2 className="text-lg" />
                                            </button>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        <div
                            className="chat-option text-center justify-center pt-2.5 text-white dark:text-gray-100"
                            onClick={() => handleDeleteAll()}
                        >
                            {t("Delete all uploads")}
                        </div>
                    </Popover.Panel>
                </Popover>
            )}
        </div>
    );
}

export default ChatTopMenu;
