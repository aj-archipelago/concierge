"use client";

import { Pencil, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAutomations } from "../../../src/hooks/useAutomations";
import classNames from "../../utils/class-names";

export default function EditDigestBlock({
    value,
    onChange,
    preferredMode,
    hideSourceToggle = false,
    lockedMode,
    compact = false,
    className,
}) {
    const { t } = useTranslation();
    const { data: automations = [] } = useAutomations();

    const initialMode =
        lockedMode ||
        preferredMode ||
        (value.automationId ? "automation" : "prompt");
    const [mode, setMode] = useState(initialMode);
    const effectiveMode = lockedMode || mode;
    const showToggle = !hideSourceToggle && !lockedMode;
    const [titleEdited, setTitleEdited] = useState(Boolean(value.title));
    const selectedAutomation =
        automations.find(
            (automation) =>
                String(automation._id) === String(value.automationId),
        ) || null;

    // Auto-populate the widget title from the automation name until the user
    // types their own.
    useEffect(() => {
        if (
            effectiveMode === "automation" &&
            selectedAutomation &&
            !titleEdited &&
            !value.title
        ) {
            onChange({ ...value, title: selectedAutomation.name || "" });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedAutomation, effectiveMode]);

    const setSourceMode = (nextMode) => {
        setMode(nextMode);
        if (nextMode === "prompt") {
            onChange({ ...value, automationId: null });
        } else {
            onChange({ ...value, prompt: "" });
        }
    };

    const titleInput = (
        <input
            placeholder={t("Title (optional)")}
            className={classNames(
                "lb-input font-semibold",
                compact ? "mb-2 shrink-0" : "mb-3",
            )}
            value={value.title || ""}
            onChange={(event) => {
                setTitleEdited(true);
                onChange({
                    ...value,
                    title: event.target.value,
                });
            }}
        />
    );

    return (
        <div
            className={classNames(
                compact && "flex min-h-0 flex-1 flex-col",
                className,
            )}
        >
            {showToggle ? (
                <div
                    className={classNames(
                        "inline-flex shrink-0 rounded-md border border-gray-200 bg-white p-0.5 text-xs dark:border-gray-600 dark:bg-gray-800",
                        compact ? "mb-2" : "mb-3",
                    )}
                >
                    <button
                        type="button"
                        onClick={() => setSourceMode("prompt")}
                        className={classNames(
                            "rounded-sm px-3 py-1",
                            mode === "prompt"
                                ? "bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-200"
                                : "text-gray-600 dark:text-gray-300",
                        )}
                    >
                        {t("Prompt")}
                    </button>
                    <button
                        type="button"
                        onClick={() => setSourceMode("automation")}
                        className={classNames(
                            "inline-flex items-center gap-1 rounded-sm px-3 py-1",
                            mode === "automation"
                                ? "bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-200"
                                : "text-gray-600 dark:text-gray-300",
                        )}
                    >
                        <Sparkles className="h-3 w-3" />
                        {t("Task")}
                    </button>
                </div>
            ) : null}
            {effectiveMode === "prompt" ? (
                <>
                    {titleInput}
                    <textarea
                        placeholder={t("Prompt")}
                        className={classNames(
                            "lb-input",
                            compact && "min-h-0 flex-1 resize-none",
                        )}
                        rows={compact ? 3 : 6}
                        value={value.prompt || ""}
                        onChange={(event) => {
                            onChange({
                                ...value,
                                prompt: event.target.value,
                            });
                        }}
                    />
                </>
            ) : (
                <>
                    {value.automationId ? (
                        <div className="mb-2 flex items-center justify-between gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-700 dark:bg-gray-800/50">
                            <div className="flex min-w-0 items-center gap-2">
                                <Sparkles className="h-4 w-4 shrink-0 text-sky-600 dark:text-sky-300" />
                                <span className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                                    {selectedAutomation?.name || t("Untitled")}
                                </span>
                            </div>
                            <a
                                href={`/automations/${value.automationId}`}
                                className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-sky-600 hover:text-sky-700 dark:text-sky-400 dark:hover:text-sky-300"
                            >
                                <Pencil className="h-3.5 w-3.5" />
                                {t("Edit task")}
                            </a>
                        </div>
                    ) : (
                        <div className="mb-2 rounded-md border border-dashed border-gray-300 px-3 py-4 text-xs text-gray-500 dark:border-gray-600 dark:text-gray-400">
                            {t("This report isn't linked to a task yet.")}
                        </div>
                    )}
                    {titleInput}
                    <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                        {t("This card shows the latest task result.")}
                    </p>
                </>
            )}
        </div>
    );
}
