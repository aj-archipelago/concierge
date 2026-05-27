"use client";

import { Maximize2, MessageSquare, RefreshCw, Sparkles, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useContext, useState } from "react";
import { useTranslation } from "react-i18next";
import ReactTimeAgo from "react-time-ago";
import { Progress } from "../../../@/components/ui/progress";
import { convertMessageToMarkdown } from "../../../src/components/chat/ChatMessage";
import { LanguageContext } from "../../../src/contexts/LanguageProvider";
import AutomationHtmlFrame from "../../../src/components/automations/AutomationHtmlFrame";
import Loader from "../../components/loader";
import { useAddChat } from "../../queries/chats";
import { useRegenerateDigestBlock } from "../../queries/digest";
import { useTask } from "../../queries/notifications";
import classNames from "../../utils/class-names";

function isAutomationBlock(block) {
    return Boolean(block?.automationId);
}

export default function DigestBlock({ block, contentClassName }) {
    const regenerateDigestBlock = useRegenerateDigestBlock();
    const addChat = useAddChat();
    const router = useRouter();
    const { t } = useTranslation();
    const { language } = useContext(LanguageContext);
    const [fullscreen, setFullscreen] = useState(false);

    // Add task query if block has a taskId (only for prompt-built blocks).
    const { data: task } = useTask(
        isAutomationBlock(block) ? null : block?.taskId,
    );

    if (!block) {
        return null;
    }

    const isAutomation = isAutomationBlock(block);
    const isRebuilding =
        !isAutomation &&
        (regenerateDigestBlock.isPending ||
            task?.status === "pending" ||
            task?.status === "in_progress");

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
                    sender: "assistant",
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

    const automationUpdatedAt = isAutomation
        ? block?.automationRun?.completedAt || block?.automationRun?.createdAt
        : null;
    const updatedAt = isAutomation ? automationUpdatedAt : block.updatedAt;
    const canFullscreen = Boolean(
        (isAutomation && block?.automation?._id && block?.automationRun) ||
            (!isAutomation && block.content),
    );

    return (
        <div
            key={block._id}
            className="bg-gray-50 dark:bg-gray-700 p-4 rounded-md border"
        >
            <div className="flex justify-between gap-2 items-center mb-4">
                <h4 className="font-semibold text-gray-900 dark:text-gray-100 inline-flex items-center gap-2 min-w-0">
                    <span className="truncate">
                        {t(block.title, { defaultValue: block.title })}
                    </span>
                    {isAutomation && (
                        <span
                            title={t("Connected to an automation")}
                            className="shrink-0 inline-flex items-center gap-1 rounded-full bg-sky-50 dark:bg-sky-900/30 px-1.5 py-0.5 text-[10px] font-medium text-sky-700 dark:text-sky-200"
                        >
                            <Sparkles className="h-3 w-3" />
                            {t("Automation")}
                        </span>
                    )}
                </h4>
                <div className="flex items-center gap-2">
                    {!isAutomation && block.content && (
                        <button
                            className="shrink-0 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-300"
                            onClick={handleOpenInChat}
                            title={t("Open in chat")}
                        >
                            <MessageSquare size={14} />
                        </button>
                    )}
                    {canFullscreen && (
                        <button
                            type="button"
                            className="shrink-0 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-300"
                            onClick={() => setFullscreen(true)}
                            title={t("Full screen")}
                        >
                            <Maximize2 size={14} />
                        </button>
                    )}
                    <div>
                        <div
                            className={classNames(
                                "text-xs flex items-center gap-2 rounded-full px-3 py-2 border bg-gray-50 dark:bg-gray-600 whitespace-nowrap",
                                !isAutomation &&
                                    task?.status !== "pending" &&
                                    task?.status !== "in_progress" &&
                                    "cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-500",
                            )}
                            onClick={() => {
                                if (
                                    !isAutomation &&
                                    task?.status !== "pending" &&
                                    task?.status !== "in_progress"
                                ) {
                                    regenerateDigestBlock.mutate({
                                        blockId: block._id,
                                    });
                                }
                            }}
                        >
                            {!isAutomation &&
                                updatedAt &&
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
                                ) : updatedAt ? (
                                    <>
                                        <span className="hidden lg:inline">
                                            {t("Updated")}
                                        </span>{" "}
                                        <ReactTimeAgo
                                            date={new Date(updatedAt)}
                                            locale={language}
                                        />
                                    </>
                                ) : isAutomation ? (
                                    <span className="hidden lg:inline">
                                        {t("No runs yet")}
                                    </span>
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
            {fullscreen && (
                <FullscreenBlock
                    block={block}
                    onClose={() => setFullscreen(false)}
                />
            )}
        </div>
    );
}

function FullscreenBlock({ block, onClose }) {
    const { t } = useTranslation();
    const isAutomation = isAutomationBlock(block);
    const run = isAutomation ? block?.automationRun : null;
    const showHtml = Boolean(isAutomation && run?.hasHtmlOutput);

    return (
        <div
            className="fixed inset-0 z-50 flex flex-col bg-white dark:bg-gray-900"
            role="dialog"
            aria-modal="true"
        >
            <div className="flex items-center justify-between gap-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3">
                <h2 className="truncate text-base font-semibold text-gray-900 dark:text-gray-100">
                    {t(block.title, { defaultValue: block.title })}
                </h2>
                <button
                    type="button"
                    onClick={onClose}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                    title={t("Close")}
                    autoFocus
                >
                    <X className="h-4 w-4" />
                    {t("Close")}
                </button>
            </div>
            {showHtml ? (
                <AutomationHtmlFrame
                    automationId={block.automation._id}
                    taskId={run.taskId}
                    cacheVersion={
                        run.updatedAt || run.completedAt || run.createdAt
                    }
                    title={block.title}
                    className="min-h-0 flex-1"
                />
            ) : (
                <div className="min-h-0 flex-1 overflow-auto p-6">
                    <div className="mx-auto max-w-3xl text-sm">
                        <BlockContent block={block} />
                    </div>
                </div>
            )}
        </div>
    );
}

function BlockContent({ block }) {
    const { t } = useTranslation();
    const isAutomation = isAutomationBlock(block);
    const { data: task } = useTask(isAutomation ? null : block?.taskId);

    if (isAutomation) {
        if (block.automationMissing) {
            return (
                <div className="text-red-500">
                    {t(
                        "Linked automation no longer exists. Edit this widget to fix it.",
                    )}
                </div>
            );
        }

        const run = block.automationRun;
        if (!run) {
            return (
                <div className="text-gray-500 dark:text-gray-400">
                    {t("No runs yet for this automation.")}
                </div>
            );
        }
        if (run.status === "pending" || run.status === "in_progress") {
            return (
                <div className="text-gray-500 dark:text-gray-400 flex items-center gap-4 m-2">
                    <Loader />
                    {t("Running...")}
                </div>
            );
        }
        if (run.status === "failed") {
            return <div className="text-red-500">{t("Last run failed.")}</div>;
        }
        if (run.hasHtmlOutput) {
            return (
                <AutomationHtmlFrame
                    automationId={block.automation._id}
                    taskId={run.taskId}
                    cacheVersion={
                        run.updatedAt || run.completedAt || run.createdAt
                    }
                    title={block.title}
                    className="h-[28rem] rounded"
                />
            );
        }
        if (run.summary) {
            return convertMessageToMarkdown({ payload: run.summary });
        }
        return (
            <div className="text-gray-500 dark:text-gray-400">
                {t("No output yet.")}
            </div>
        );
    }

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
        return t("digest_block_no_content");
    }

    return convertMessageToMarkdown(JSON.parse(block.content));
}
