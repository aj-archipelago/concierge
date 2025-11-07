"use client";

import { MessageSquare, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useContext } from "react";
import { useTranslation } from "react-i18next";
import ReactTimeAgo from "react-time-ago";
import { Progress } from "../../../@/components/ui/progress";
import { convertMessageToMarkdown } from "../../../src/components/chat/ChatMessage";
import { LanguageContext } from "../../../src/contexts/LanguageProvider";
import Loader from "../../components/loader";
import { useAddChat } from "../../queries/chats";
import { useRegenerateDigestBlock } from "../../queries/digest";
import { useTask } from "../../queries/notifications";
import classNames from "../../utils/class-names";

export default function DigestBlock({ block, contentClassName }) {
    const regenerateDigestBlock = useRegenerateDigestBlock();
    const addChat = useAddChat();
    const router = useRouter();
    const { t } = useTranslation();
    const { language } = useContext(LanguageContext);

    // Add task query if block has a taskId
    const { data: task } = useTask(block?.taskId);

    if (!block) {
        return null;
    }

    const isRebuilding =
        regenerateDigestBlock.isPending ||
        task?.status === "pending" ||
        task?.status === "in_progress";

    const handleOpenInChat = async () => {
        try {
            const blockContent = JSON.parse(block.content);
            const messages = [
                {
                    payload: block.prompt,
                    sender: "user",
                    sentTime: new Date().toISOString(),
                    direction: "outgoing",
                    position: "single",
                },
                {
                    payload: blockContent.payload,
                    tool: blockContent.tool,
                    sender: "labeeb",
                    sentTime: new Date().toISOString(),
                    direction: "incoming",
                    position: "single",
                },
            ];
            const { _id } = await addChat.mutateAsync({
                messages,
                title: block.title,
            });
            router.push(`/chat/${_id}`);
        } catch (error) {
            console.error("Error creating chat:", error);
        }
    };

    return (
        <div
            key={block._id}
            className="bg-gray-50 dark:bg-gray-700 p-4 rounded-md border"
        >
            <div className="flex justify-between gap-2 items-center mb-4">
                <h4 className="font-semibold text-gray-900 dark:text-gray-100">
                    {block.title}
                </h4>
                <div className="flex items-center gap-2">
                    {block.content && (
                        <button
                            className="shrink-0 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-300"
                            onClick={handleOpenInChat}
                            title={t("Open in chat")}
                        >
                            <MessageSquare size={14} />
                        </button>
                    )}
                    <div>
                        <div
                            className={classNames(
                                "text-xs flex items-center gap-2 rounded-full px-3 py-2 border bg-gray-50 dark:bg-gray-600 whitespace-nowrap",
                                task?.status !== "pending" &&
                                    task?.status !== "in_progress" &&
                                    "cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-500",
                            )}
                            onClick={() => {
                                if (
                                    task?.status !== "pending" &&
                                    task?.status !== "in_progress"
                                ) {
                                    regenerateDigestBlock.mutate({
                                        blockId: block._id,
                                    });
                                }
                            }}
                        >
                            {block.updatedAt &&
                                (!isRebuilding || !task?.progress) && (
                                    <RefreshCw
                                        className={classNames(
                                            "text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-300 shrink-0",
                                            isRebuilding ? "animate-spin" : "",
                                            "inline-block",
                                        )}
                                        size={14}
                                    />
                                )}
                            <div className="flex items-center justify-center gap-1 min-w-0">
                                {isRebuilding ? (
                                    task?.progress ? (
                                        <Progress
                                            value={
                                                Math.min(
                                                    Math.max(task.progress, 0),
                                                    1,
                                                ) * 100
                                            }
                                            className="w-24"
                                        />
                                    ) : (
                                        t("Rebuilding...")
                                    )
                                ) : block.updatedAt ? (
                                    <>
                                        <span className="hidden lg:inline">
                                            {t("Updated")}
                                        </span>{" "}
                                        <ReactTimeAgo
                                            date={block.updatedAt}
                                            locale={language}
                                        />
                                    </>
                                ) : (
                                    <span className="hidden lg:inline">
                                        {t("Build now")}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div className="text-sm">
                <div className={contentClassName}>
                    <BlockContent block={block} />
                </div>
            </div>
        </div>
    );
}

function BlockContent({ block }) {
    const { t } = useTranslation();
    const { data: task } = useTask(block?.taskId);

    if (
        (task?.status === "pending" || task?.status === "in_progress") &&
        !block.content
    ) {
        return (
            <div className="text-gray-500 dark:text-gray-400 flex items-center gap-4 m-2 ">
                <Loader />
                {t("Building")}. {t("This may take a minute or two.")}
            </div>
        );
    }

    if (task?.status === "failed") {
        return (
            <div className="text-red-500">
                {t("Error building digest block:")}{" "}
                {task.statusText || task.error}
            </div>
        );
    }

    if (!block.content) {
        return "(No content)";
    }

    return convertMessageToMarkdown(JSON.parse(block.content));
}
