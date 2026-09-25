"use client";

import { useContext, useEffect, useId, useRef, useState } from "react";
import { Brain, ChevronDown, ChevronUp } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { LanguageContext } from "../contexts/LanguageProvider";
import {
    getReasoningEffortLevelsForModel,
    normalizeReasoningEffortForModel,
    reasoningEffortLevelLabelKey,
} from "../utils/reasoningEffortI18n";
import styles from "./ModelThinkingControl.module.css";

const commitKeys = new Set([
    "ArrowLeft",
    "ArrowRight",
    "ArrowUp",
    "ArrowDown",
    "Home",
    "End",
    "PageUp",
    "PageDown",
]);

export function ThinkingSlider({ model, value, onChange, disabled = false }) {
    const { t } = useTranslation();
    const id = useId();
    const levels = getReasoningEffortLevelsForModel(model);
    const selected = normalizeReasoningEffortForModel(model, value);
    const [draft, setDraft] = useState(selected);
    const lastCommitted = useRef(selected);
    useEffect(() => {
        setDraft(selected);
        lastCommitted.current = selected;
    }, [selected, model?.modelId]);
    const level = levels.includes(draft) ? draft : selected;
    const index = levels.indexOf(level);
    const fixed = levels.length === 1;
    const commit = async (next) => {
        if (disabled || fixed || next === lastCommitted.current) return;
        lastCommitted.current = next;
        try {
            if ((await onChange(next)) !== false) return;
        } catch {
            // The owning settings surface displays the persistence error.
        }
        lastCommitted.current = selected;
        setDraft(selected);
    };

    return (
        <div className="min-w-0">
            <div className="mb-1 flex items-center justify-between gap-3">
                <label
                    htmlFor={id}
                    className="flex items-center gap-2 text-sm font-medium text-gray-800 dark:text-gray-100"
                >
                    <Brain
                        aria-hidden="true"
                        className="h-4 w-4 text-sky-700 dark:text-sky-400"
                    />
                    {t("thinkingControl.label")}
                </label>
                <span className="rounded-full bg-sky-100 px-2.5 py-1 text-xs font-medium text-sky-800 dark:bg-sky-400/10 dark:text-sky-300">
                    {t(reasoningEffortLevelLabelKey(level))}
                </span>
            </div>
            <div className="relative h-10">
                <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-x-2.5 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-gray-200 dark:bg-gray-600"
                >
                    <div
                        className="absolute inset-y-0 start-0 rounded-full bg-sky-600 dark:bg-sky-400"
                        style={{
                            width: `${fixed ? 100 : (index / (levels.length - 1)) * 100}%`,
                        }}
                    />
                    <div className="absolute inset-0 flex items-center justify-between">
                        {levels.map((item, i) => (
                            <span
                                key={item}
                                className={`h-1.5 w-1.5 rounded-full ${i <= index ? "bg-sky-200 dark:bg-sky-200" : "bg-gray-400 dark:bg-gray-400"}`}
                            />
                        ))}
                    </div>
                </div>
                <input
                    id={id}
                    type="range"
                    min={0}
                    max={Math.max(1, levels.length - 1)}
                    step={1}
                    value={index}
                    disabled={disabled || fixed}
                    aria-valuetext={t(reasoningEffortLevelLabelKey(level))}
                    aria-describedby={`${id}-description`}
                    onChange={(event) =>
                        setDraft(levels[Number(event.target.value)])
                    }
                    onPointerUp={(event) =>
                        commit(levels[Number(event.currentTarget.value)])
                    }
                    onKeyUp={(event) => {
                        if (commitKeys.has(event.key))
                            commit(levels[Number(event.currentTarget.value)]);
                    }}
                    onBlur={() => commit(level)}
                    onPointerCancel={() => setDraft(selected)}
                    className={`${styles.slider} relative block h-10 w-full cursor-pointer disabled:cursor-default disabled:opacity-60`}
                />
            </div>
            <div className="-mx-2 flex justify-between gap-1">
                {levels.map((item) => (
                    <button
                        key={item}
                        type="button"
                        disabled={disabled || fixed}
                        aria-pressed={item === level}
                        onClick={() => {
                            setDraft(item);
                            commit(item);
                        }}
                        className={`min-h-10 min-w-10 rounded-lg px-2 text-xs transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500 disabled:cursor-default ${item === level ? "font-semibold text-sky-700 dark:text-sky-300" : "text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"}`}
                    >
                        {t(reasoningEffortLevelLabelKey(item))}
                    </button>
                ))}
            </div>
            <p
                id={`${id}-description`}
                className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400"
            >
                {t(fixed ? "thinkingControl.fixed" : "thinkingControl.hint")}
            </p>
        </div>
    );
}

export function ModelThinkingPanel({
    models = [],
    modelId,
    reasoningEffort,
    onChange,
    disabled = false,
    icon,
    title,
}) {
    const { t } = useTranslation();
    const { direction } = useContext(LanguageContext);
    const id = useId();
    const model = models.find((item) => item.modelId === modelId);
    return (
        <div
            dir={direction}
            role="group"
            aria-label={t("thinkingControl.settings")}
            className="overflow-hidden rounded-2xl border border-gray-200 bg-white text-start shadow-sm dark:border-gray-600/70 dark:bg-gray-800"
        >
            <div className="border-b border-gray-200/80 bg-gray-50/80 p-4 dark:border-gray-600/60 dark:bg-gray-900/25">
                <label
                    htmlFor={id}
                    className="mb-2 block text-xs font-medium text-gray-500 dark:text-gray-400"
                >
                    {title || t("Model")}
                </label>
                <div className="relative flex items-center gap-2.5">
                    {icon && (
                        <span
                            aria-hidden="true"
                            className="shrink-0 text-gray-700 dark:text-gray-200"
                        >
                            {icon}
                        </span>
                    )}
                    <select
                        id={id}
                        aria-label={t("Model")}
                        value={modelId || ""}
                        disabled={disabled || !models.length}
                        onChange={(event) =>
                            onChange({
                                model: event.target.value,
                                reasoningEffort:
                                    normalizeReasoningEffortForModel(
                                        models.find(
                                            (item) =>
                                                item.modelId ===
                                                event.target.value,
                                        ),
                                        reasoningEffort,
                                    ),
                            })
                        }
                        className="min-h-10 w-full min-w-0 appearance-none rounded-lg border border-gray-200 bg-white bg-none py-2 pe-8 ps-3 text-sm font-medium text-gray-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20 disabled:opacity-60 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                    >
                        {models.map((item) => (
                            <option key={item.modelId} value={item.modelId}>
                                {t(item.displayName || item.modelId)}
                            </option>
                        ))}
                    </select>
                    <ChevronDown
                        aria-hidden="true"
                        className="pointer-events-none absolute end-2.5 h-4 w-4 text-gray-500 dark:text-gray-400"
                    />
                </div>
            </div>
            <div className="p-4">
                <ThinkingSlider
                    key={modelId}
                    model={model}
                    value={reasoningEffort}
                    disabled={disabled || !model}
                    onChange={(effort) => onChange({ reasoningEffort: effort })}
                />
            </div>
        </div>
    );
}

export default function ModelThinkingControl({ label, error, ...props }) {
    const { t } = useTranslation();
    const { direction } = useContext(LanguageContext);
    const model = props.models?.find((item) => item.modelId === props.modelId);
    const effort = normalizeReasoningEffortForModel(
        model,
        props.reasoningEffort,
    );
    const modelName = t(model?.displayName || props.modelId || "Model");
    return (
        <Popover>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    disabled={props.disabled}
                    aria-label={label}
                    className="group flex min-h-10 max-w-full items-center gap-2 rounded-full border border-gray-300/80 bg-white/80 px-3 text-xs text-gray-700 shadow-sm transition-colors hover:border-sky-400 hover:bg-sky-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500 disabled:opacity-60 dark:border-gray-600 dark:bg-gray-900/40 dark:text-gray-200 dark:hover:border-sky-500/60 dark:hover:bg-gray-700"
                >
                    {props.icon}
                    <span className="max-w-[7rem] truncate sm:max-w-[11rem]">
                        {modelName}
                    </span>
                    <span
                        aria-hidden="true"
                        className="h-4 w-px bg-gray-300 dark:bg-gray-600"
                    />
                    <Brain
                        aria-hidden="true"
                        className="h-3.5 w-3.5 shrink-0 text-sky-700 dark:text-sky-400"
                    />
                    <span className="text-sky-700 dark:text-sky-300">
                        {t(reasoningEffortLevelLabelKey(effort))}
                    </span>
                    <ChevronUp
                        aria-hidden="true"
                        className="h-3.5 w-3.5 shrink-0 text-gray-400 transition-transform group-data-[state=open]:rotate-180 dark:text-gray-500"
                    />
                </button>
            </PopoverTrigger>
            <PopoverContent
                side="top"
                align="end"
                sideOffset={10}
                dir={direction}
                className="w-80 max-w-[calc(100vw-1rem)] rounded-2xl border-0 bg-transparent p-0 shadow-xl dark:bg-transparent"
            >
                <ModelThinkingPanel {...props} />
                {error && (
                    <p
                        role="alert"
                        className="rounded-b-xl bg-red-50 px-4 py-2 text-xs text-red-700 dark:bg-gray-800 dark:text-red-300"
                    >
                        {error}
                    </p>
                )}
            </PopoverContent>
        </Popover>
    );
}
