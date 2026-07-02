"use client";

import { Sparkles } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAutomations } from "../../../src/hooks/useAutomations";
import classNames from "../../utils/class-names";

export default function EditDigestBlock({
    value,
    onChange,
    preferredMode,
    hideSourceToggle = false,
    compact = false,
    className,
}) {
    const { t } = useTranslation();
    const { data: automations = [] } = useAutomations();

    const initialMode =
        preferredMode || (value.automationId ? "automation" : "prompt");
    const [mode, setMode] = useState(initialMode);

    const setSourceMode = (nextMode) => {
        setMode(nextMode);
        if (nextMode === "prompt") {
            onChange({ ...value, automationId: null });
        } else {
            onChange({ ...value, prompt: "" });
        }
    };

    return (
        <div
            className={classNames(
                compact && "flex min-h-0 flex-1 flex-col",
                className,
            )}
        >
            <input
                placeholder={t("Title")}
                className={classNames(
                    "lb-input font-semibold",
                    compact ? "mb-2 shrink-0" : "mb-3",
                )}
                value={value.title}
                onChange={(event) => {
                    onChange({
                        ...value,
                        title: event.target.value,
                    });
                }}
            />
            {!hideSourceToggle ? (
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
                        {t("Automation")}
                    </button>
                </div>
            ) : null}
            {mode === "prompt" ? (
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
            ) : automations.length === 0 ? (
                <div className="rounded-md border border-dashed border-gray-300 px-3 py-4 text-xs text-gray-500 dark:border-gray-600 dark:text-gray-400">
                    {t("No automations yet.")}{" "}
                    <a
                        href="/automations"
                        className="text-sky-600 hover:underline dark:text-sky-400"
                    >
                        {t("Create one")}
                    </a>
                </div>
            ) : (
                <>
                    <select
                        className="lb-input"
                        value={value.automationId || ""}
                        onChange={(event) => {
                            onChange({
                                ...value,
                                automationId: event.target.value || null,
                            });
                        }}
                    >
                        <option value="">{t("Select an automation...")}</option>
                        {automations.map((automation) => (
                            <option key={automation._id} value={automation._id}>
                                {automation.name}
                                {automation.producesHtml ? " · HTML" : ""}
                            </option>
                        ))}
                    </select>
                    <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                        {t(
                            "This widget will display the automation's most recent run.",
                        )}
                    </p>
                </>
            )}
        </div>
    );
}
