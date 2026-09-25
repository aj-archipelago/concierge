"use client";

import {
    AlertTriangle,
    Maximize2,
    MessageSquare,
    RefreshCw,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { cloneElement, useContext, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "react-toastify";
import ReactTimeAgo from "react-time-ago";
import { useQueryClient } from "@tanstack/react-query";
import { convertMessageToMarkdown } from "../../../src/components/chat/ChatMessage";
import { LanguageContext } from "../../../src/contexts/LanguageProvider";
import AutomationHtmlFrame from "../../../src/components/automations/AutomationHtmlFrame";
import Loader from "../../components/loader";
import { useAddChat } from "../../queries/chats";
import { useRegenerateDigestBlock } from "../../queries/digest";
import { useTask } from "../../queries/notifications";
import classNames from "../../utils/class-names";
import HomeFullscreenDialog from "./HomeFullscreenDialog";

function getBlockTitle(block) {
    return block.title?.trim() || block.automation?.name || "Untitled";
}

function isAutomationBlock(block) {
    return Boolean(block?.automationId);
}

function getAutomationId(block) {
    return block?.automation?._id || block?.automationId;
}

export default function DigestBlock({
    block,
    contentClassName,
    className,
    isLayoutEditing = false,
    menu,
    onOpen,
    renderSummary,
}) {
    const regenerateDigestBlock = useRegenerateDigestBlock();
    const addChat = useAddChat();
    const queryClient = useQueryClient();
    const router = useRouter();
    const { t } = useTranslation();
    const { language } = useContext(LanguageContext);
    const [fullscreen, setFullscreen] = useState(false);
    const [isRunning, setIsRunning] = useState(false);

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
    // An automation that is turned off won't refresh on its schedule, so its
    // content on the dashboard can go stale — flag it for the user.
    const isAutomationDisabled =
        isAutomation &&
        !block.automationMissing &&
        block.automation &&
        block.automation.enabled === false;
    const runStatus = isAutomation ? block?.automationRun?.status : null;
    const isRunActive =
        runStatus === "pending" || runStatus === "in_progress" || isRunning;

    const handleRunNow = async () => {
        const automationId = getAutomationId(block);
        if (!automationId || isRunActive) return;
        setIsRunning(true);
        try {
            const res = await fetch(`/api/automations/${automationId}/run`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({}),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(
                    data?.error ||
                        t("Couldn't start this task. Please try again."),
                );
            }
            toast.success(t("Task started. Its report will appear here."));
            queryClient.invalidateQueries({ queryKey: ["currentUserDigest"] });
        } catch (error) {
            toast.error(
                error.message ||
                    t("Couldn't start this task. Please try again."),
            );
            setIsRunning(false);
        }
    };

    const handleOpenInChat = async () => {
        try {
            const blockContent = JSON.parse(block.content);
            const openedAt = Date.now();
            const messages = [
                {
                    payload: block.prompt,
                    sender: "user",
                    sentTime: new Date(openedAt).toISOString(),
                    direction: "outgoing",
                    position: "single",
                },
                {
                    payload: blockContent.payload,
                    tool: blockContent.tool,
                    sender: "assistant",
                    sentTime: new Date(openedAt + 1).toISOString(),
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
        (isAutomation && getAutomationId(block) && block?.automationRun) ||
            (!isAutomation && block.content),
    );

    const actionMenu = menu
        ? cloneElement(menu, {
              onRefresh: isAutomation
                  ? handleRunNow
                  : () =>
                        regenerateDigestBlock.mutate({
                            blockId: block._id,
                        }),
              refreshLabel: t(isAutomation ? "Run now" : "Refresh"),
              refreshDisabled: isRunActive || isRebuilding,
              onChat: !isAutomation && block.content ? handleOpenInChat : null,
          })
        : null;
    if (renderSummary) return renderSummary(actionMenu);

    return (
        <div
            key={block._id}
            data-testid="home-digest-block"
            className={classNames(
                "flex h-full min-h-0 flex-col rounded-2xl border border-gray-200/90 bg-white shadow-sm ring-1 ring-black/[0.04] dark:border-gray-700/90 dark:bg-gray-800 dark:ring-white/[0.06]",
                className,
            )}
        >
            <div
                className={classNames(
                    "flex min-h-14 shrink-0 items-center gap-2 border-b border-gray-100 px-3 py-1 dark:border-gray-700",
                    isLayoutEditing && "ps-10 pe-28",
                )}
                data-testid="home-card-toolbar"
            >
                <div className="min-w-0 flex-1">
                    <h4 className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
                        {t(getBlockTitle(block), {
                            defaultValue: getBlockTitle(block),
                        })}
                    </h4>
                    <div
                        className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400"
                        aria-live="polite"
                    >
                        {isRebuilding || isRunActive ? (
                            <>
                                <RefreshCw className="h-3 w-3 animate-spin" />
                                {t("Updating…")}
                            </>
                        ) : updatedAt ? (
                            <>
                                <span>{t("Updated")}</span>
                                <ReactTimeAgo
                                    date={new Date(updatedAt)}
                                    locale={language}
                                />
                            </>
                        ) : (
                            t("No report yet")
                        )}
                        {isAutomationDisabled && (
                            <DisabledWarning
                                automationId={getAutomationId(block)}
                                onEnabled={() =>
                                    queryClient.invalidateQueries({
                                        queryKey: ["currentUserDigest"],
                                    })
                                }
                                t={t}
                            />
                        )}
                    </div>
                </div>
                {!isLayoutEditing && (
                    <>
                        {canFullscreen && (
                            <button
                                type="button"
                                onClick={() =>
                                    onOpen ? onOpen() : setFullscreen(true)
                                }
                                title={t("Open report")}
                                aria-label={t("Open report")}
                                className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg px-2 text-sm text-gray-600 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:text-gray-300 dark:hover:bg-gray-700"
                            >
                                <Maximize2 className="h-4 w-4" />
                                {t("Open")}
                            </button>
                        )}
                        {!menu && !isAutomation && block.content && (
                            <button
                                type="button"
                                onClick={handleOpenInChat}
                                title={t("Open in chat")}
                                aria-label={t("Open in chat")}
                                className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
                            >
                                <MessageSquare className="h-4 w-4" />
                            </button>
                        )}
                        {menu ? (
                            actionMenu
                        ) : (
                            <button
                                type="button"
                                title={t(isAutomation ? "Run now" : "Refresh")}
                                aria-label={t(
                                    isAutomation ? "Run now" : "Refresh",
                                )}
                                disabled={isRunActive || isRebuilding}
                                onClick={
                                    isAutomation
                                        ? handleRunNow
                                        : () =>
                                              regenerateDigestBlock.mutate({
                                                  blockId: block._id,
                                              })
                                }
                                className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
                            >
                                <RefreshCw className="h-4 w-4" />
                            </button>
                        )}
                    </>
                )}
            </div>
            <div className="min-h-0 flex-1 overflow-hidden rounded-b-2xl text-sm">
                <div className={classNames("h-full min-h-0", contentClassName)}>
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

function DisabledWarning({ automationId, onEnabled, t }) {
    const [isEnabling, setIsEnabling] = useState(false);
    const message = t(
        "This task is paused, so its report won't update automatically.",
    );

    const handleEnable = async (event) => {
        event.stopPropagation();
        if (!automationId || isEnabling) return;
        setIsEnabling(true);
        try {
            const res = await fetch(`/api/automations/${automationId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ enabled: true }),
            });
            if (!res.ok) throw new Error();
            toast.success(t("Task resumed."));
            onEnabled?.();
        } catch {
            toast.error(t("Couldn't resume this task. Please try again."));
            setIsEnabling(false);
        }
    };

    return (
        <div className="group/warn relative">
            <AlertTriangle
                tabIndex={0}
                aria-label={message}
                className="h-4 w-4 shrink-0 text-amber-500 outline-none dark:text-amber-400"
            />
            <div className="absolute end-0 top-full z-50 hidden pt-2 group-hover/warn:block group-focus-within/warn:block">
                <div className="w-64 rounded-md border border-gray-200 bg-white p-3 text-start shadow-lg dark:border-gray-700 dark:bg-gray-800">
                    <p className="text-xs text-gray-600 dark:text-gray-300">
                        {message}
                    </p>
                    <button
                        type="button"
                        onClick={handleEnable}
                        disabled={isEnabling}
                        className="mt-2 text-xs font-medium text-sky-600 hover:text-sky-700 disabled:opacity-60 dark:text-sky-400 dark:hover:text-sky-300"
                    >
                        {isEnabling ? t("Enabling...") : t("Enable")}
                    </button>
                </div>
            </div>
        </div>
    );
}

export function FullscreenBlock({ block, onClose }) {
    const { t } = useTranslation();
    const isAutomation = isAutomationBlock(block);
    const run = isAutomation ? block?.automationRun : null;
    const automationId = getAutomationId(block);
    const showHtml = Boolean(
        isAutomation && automationId && run?.hasHtmlOutput,
    );
    return (
        <HomeFullscreenDialog
            title={t(getBlockTitle(block), {
                defaultValue: getBlockTitle(block),
            })}
            onClose={onClose}
        >
            {showHtml ? (
                <AutomationHtmlFrame
                    automationId={automationId}
                    taskId={run.taskId}
                    cacheVersion={
                        run.updatedAt || run.completedAt || run.createdAt
                    }
                    title={getBlockTitle(block)}
                    className="min-h-0 flex-1"
                />
            ) : (
                <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-6">
                    <div className="mx-auto max-w-3xl text-sm">
                        <BlockContent block={block} />
                    </div>
                </div>
            )}
        </HomeFullscreenDialog>
    );
}

function BlockContent({ block }) {
    const { t } = useTranslation();
    const isAutomation = isAutomationBlock(block);
    const { data: task } = useTask(isAutomation ? null : block?.taskId);

    if (isAutomation) {
        if (block.automationMissing) {
            return (
                <div className="px-3 py-2 text-red-500">
                    {t(
                        "This task is no longer available. You can remove this card from Home.",
                    )}
                </div>
            );
        }

        const run = block.automationRun;
        if (!run) {
            return (
                <div className="px-3 py-2 text-gray-500 dark:text-gray-400">
                    {t(
                        "No report yet. It will appear here after the task runs.",
                    )}
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
            return (
                <div className="px-3 py-2 text-red-500">
                    {t("Last run failed.")}
                </div>
            );
        }
        if (run.hasHtmlOutput) {
            return (
                <AutomationHtmlFrame
                    automationId={getAutomationId(block)}
                    taskId={run.taskId}
                    variant="widget"
                    cacheVersion={
                        run.updatedAt || run.completedAt || run.createdAt
                    }
                    title={getBlockTitle(block)}
                    className="h-full min-h-0 rounded-none"
                />
            );
        }
        if (run.summary) {
            return (
                <div className="h-full overflow-auto px-3 py-2">
                    {convertMessageToMarkdown({
                        payload: run.summary,
                        tool: run.tool,
                    })}
                </div>
            );
        }
        return (
            <div className="px-3 py-2 text-gray-500 dark:text-gray-400">
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

    if (task?.status === "failed" && !block.content) {
        return (
            <div className="text-red-500">
                {t("Couldn't update this report.")}{" "}
                {task.statusText || task.error}
            </div>
        );
    }

    if (!block.content) {
        return t("digest_block_no_content");
    }

    return convertMessageToMarkdown(JSON.parse(block.content));
}
