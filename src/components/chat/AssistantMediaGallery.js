"use client";

import React, { useContext } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, AlertCircle, ImageIcon } from "lucide-react";
import { useTask } from "../../../app/queries/notifications";
import { LanguageContext } from "../../contexts/LanguageProvider";
import { getDownloadUrl } from "../../utils/fileDownloadUtils";
import { getFilename } from "../../utils/mediaUtils";
import MediaCard from "./MediaCard";
import MediaPlayback from "../common/MediaPlayback";

function readOutputs(task) {
    let data = task?.data;
    try {
        if (typeof data === "string") data = JSON.parse(data);
        if (data?.data)
            data =
                typeof data.data === "string"
                    ? JSON.parse(data.data)
                    : data.data;
    } catch {
        return [];
    }
    const files =
        Array.isArray(data?.outputFiles) && data.outputFiles.length
            ? data.outputFiles
            : [data];
    return files
        .filter(Boolean)
        .map((file) => ({
            ...file,
            url: file.azureUrl || file.url || file.gcsUrl,
        }))
        .filter(
            (file) =>
                typeof file.url === "string" && /^https?:\/\//i.test(file.url),
        );
}

function MediaTaskCard({ receipt, onLoad }) {
    const { t } = useTranslation();
    const {
        data: task,
        isError,
        refetch,
        isFetching,
    } = useTask(receipt.taskId);
    const status = task?.status || "pending";
    const completed = status === "completed";
    const failed = ["failed", "abandoned", "cancelled"].includes(status);
    const outputs = completed ? readOutputs(task) : [];
    const unavailable = (isError && !task) || (completed && !outputs.length);
    const label = unavailable
        ? "chat.media.unavailable"
        : `chat.media.${status}`;
    const Icon =
        failed || unavailable ? AlertCircle : completed ? ImageIcon : Loader2;

    return (
        <section className="min-w-0 overflow-hidden rounded-xl border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900/40">
            <div className="flex min-h-12 items-center gap-2 px-3 py-2 text-sm">
                <Icon
                    aria-hidden="true"
                    className={`h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400 ${!completed && !failed && !unavailable ? "motion-safe:animate-spin" : ""}`}
                />
                <span className="min-w-0 flex-1 break-words font-medium text-gray-900 dark:text-gray-100">
                    {receipt.name || receipt.model}
                </span>
                <span
                    role="status"
                    className="shrink-0 text-xs text-gray-500 dark:text-gray-400"
                >
                    {t(label)}
                </span>
            </div>
            {outputs.length ? (
                <div className="flex flex-col gap-2 p-2 pt-0">
                    {outputs.map((file, index) => {
                        const filename =
                            file.displayFilename ||
                            file.filename ||
                            getFilename(file.url) ||
                            `media-${index + 1}.${receipt.type === "image" ? "png" : receipt.type === "video" ? "mp4" : "mp3"}`;
                        return receipt.type === "audio" ? (
                            <MediaPlayback
                                key={`${file.url}-${index}`}
                                as="audio"
                                src={getDownloadUrl(file.url)}
                                controls
                                preload="metadata"
                                aria-label={receipt.name}
                                className="w-full min-w-0"
                                onLoadedMetadata={onLoad}
                            />
                        ) : (
                            <MediaCard
                                key={`${file.url}-${index}`}
                                type={receipt.type}
                                src={file.url}
                                filename={filename}
                                mimeType={file.mimeType}
                                onLoad={onLoad}
                                t={t}
                                variant="result"
                            />
                        );
                    })}
                </div>
            ) : (
                <div className="flex min-h-[160px] flex-col items-center justify-center gap-3 px-4 pb-4 text-center text-sm text-gray-500 dark:text-gray-400">
                    <p>
                        {t(
                            failed
                                ? "chat.media.stopped"
                                : unavailable
                                  ? "chat.media.unavailableHelp"
                                  : "chat.media.updatesHere",
                        )}
                    </p>
                    {isError && (
                        <button
                            type="button"
                            disabled={isFetching}
                            onClick={() => refetch()}
                            className="min-h-10 rounded-lg px-3 text-sky-700 hover:bg-sky-50 disabled:opacity-50 dark:text-sky-300 dark:hover:bg-sky-950"
                        >
                            {t("chat.media.retryStatus")}
                        </button>
                    )}
                </div>
            )}
        </section>
    );
}

export default function AssistantMediaGallery({ receipts, onLoad }) {
    const { direction } = useContext(LanguageContext);
    const { t } = useTranslation();
    if (!receipts?.length) return null;
    return (
        <div
            dir={direction}
            aria-label={t("chat.media.results")}
            className="my-3 grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 [.docked_&]:grid-cols-1"
        >
            {receipts.map((receipt) => (
                <MediaTaskCard
                    key={receipt.taskId}
                    receipt={receipt}
                    onLoad={onLoad}
                />
            ))}
        </div>
    );
}
