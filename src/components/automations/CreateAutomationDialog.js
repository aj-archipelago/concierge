"use client";

import { useContext, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, Sparkles } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AutosizeTextarea } from "@/components/ui/autosize-textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { LanguageContext } from "../../contexts/LanguageProvider";
import SchedulePresetChips from "./SchedulePresetChips";
import ColleagueSelect from "../colleagues/ColleagueSelect";
import { applyPreset, getPreset } from "./schedulePresets";
import {
    useCreateAutomation,
    useSuggestAutomation,
} from "../../hooks/useAutomations";

const PROMPT_PLACEHOLDERS = [
    "Summarize unread emails every weekday at 8am",
    "Generate a daily project status brief as HTML",
    "Check Jira for new high-priority issues every hour",
];

function slugify(value) {
    return String(value || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .replace(/-{2,}/g, "-")
        .slice(0, 64);
}

function buildContent(name, prompt) {
    const heading = name ? `# ${name}` : "# Task";
    const body = prompt
        ? prompt
        : "Describe what your colleague should do for this task.";
    return `${heading}\n\n${body}\n`;
}

const DEFAULT_PRESET = "manual";

export default function CreateAutomationDialog({
    open,
    onOpenChange,
    onCreated,
    initialPrompt = "",
    entityId = null,
}) {
    const { t } = useTranslation();
    const { direction } = useContext(LanguageContext);
    const [prompt, setPrompt] = useState("");
    const [assignedEntityId, setAssignedEntityId] = useState(entityId);
    useEffect(() => {
        if (open) setAssignedEntityId(entityId);
    }, [open, entityId]);
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [presetId, setPresetId] = useState(DEFAULT_PRESET);
    // Default to enabled so a newly created automation runs on its schedule
    // (and dashboard cards stay up to date) without an extra step.
    const [enabled, setEnabled] = useState(true);
    // Default to a rich HTML output.
    const [producesHtml, setProducesHtml] = useState(true);
    const [content, setContent] = useState("");
    const [hasSuggested, setHasSuggested] = useState(false);
    const [error, setError] = useState("");
    const [placeholderIndex] = useState(() =>
        Math.floor(Math.random() * PROMPT_PLACEHOLDERS.length),
    );
    const autoSuggestKeyRef = useRef("");

    const suggest = useSuggestAutomation();
    const create = useCreateAutomation();

    useEffect(() => {
        if (!open) {
            setPrompt("");
            setName("");
            setDescription("");
            setPresetId(DEFAULT_PRESET);
            setEnabled(true);
            setProducesHtml(true);
            setContent("");
            setHasSuggested(false);
            setError("");
            autoSuggestKeyRef.current = "";
            return;
        }
        const seeded = String(initialPrompt || "").trim();
        if (seeded) {
            setPrompt(seeded);
        }
    }, [open, initialPrompt]);

    const applySuggestion = async (promptText) => {
        setError("");
        const trimmed = String(promptText || "").trim();
        if (!trimmed) return;
        try {
            const suggestion = await suggest.mutateAsync(trimmed);
            setHasSuggested(true);
            if (!suggestion) {
                setError(
                    t(
                        "Couldn't generate a suggestion — fill in the details manually.",
                    ),
                );
                setName(
                    (current) =>
                        current || trimmed.split(/\s+/).slice(0, 6).join(" "),
                );
                return;
            }
            setName(suggestion.name || "");
            setDescription(suggestion.description || "");
            setPresetId(suggestion.schedulePreset || DEFAULT_PRESET);
            setProducesHtml(Boolean(suggestion.producesHtml));
            setContent(suggestion.contentMarkdown || "");
        } catch (err) {
            setError(err?.response?.data?.error || err.message);
        }
    };

    useEffect(() => {
        if (!open) return;
        const seeded = String(initialPrompt || "").trim();
        if (!seeded) return;
        const key = `${open}:${seeded}`;
        if (autoSuggestKeyRef.current === key) return;
        autoSuggestKeyRef.current = key;
        void applySuggestion(seeded);
        // Only auto-suggest when the dialog opens with a seeded prompt.
        // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional open/initialPrompt trigger
    }, [open, initialPrompt]);

    const handleSuggest = async () => {
        await applySuggestion(prompt);
    };

    const handleSubmit = async (openAfter) => {
        setError("");
        const trimmedName = name.trim();
        const finalName =
            trimmedName ||
            prompt.trim().split(/\s+/).slice(0, 6).join(" ") ||
            t("New automation");
        const preset = getPreset(presetId) || getPreset(DEFAULT_PRESET);
        const schedule = applyPreset(preset.schedule, presetId);
        const payload = {
            entityId: assignedEntityId,
            name: finalName,
            slug: slugify(finalName),
            description: description.trim(),
            enabled,
            producesHtml,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
            schedule,
            content: content.trim() ? content : buildContent(finalName, prompt),
        };

        try {
            const created = await create.mutateAsync(payload);
            onCreated?.(created, { customize: openAfter });
            onOpenChange(false);
        } catch (err) {
            setError(err?.response?.data?.error || err.message);
        }
    };

    const isBusy = suggest.isPending || create.isPending;
    const canCreate = (prompt.trim() || name.trim()) && !create.isPending;
    const placeholder = PROMPT_PLACEHOLDERS[placeholderIndex];

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                dir={direction}
                className="max-h-[calc(100dvh-2rem)] w-[calc(100vw-1rem)] overflow-y-auto rounded-2xl sm:max-w-xl"
            >
                <DialogHeader>
                    <DialogTitle>{t("New automation")}</DialogTitle>
                    <DialogDescription>
                        {t("colleagues.taskCreateIntro")}
                    </DialogDescription>
                </DialogHeader>
                <ColleagueSelect
                    value={assignedEntityId}
                    onChange={setAssignedEntityId}
                    disabled={isBusy}
                />

                <div className="space-y-4">
                    <div>
                        <AutosizeTextarea
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            placeholder={t(placeholder)}
                            aria-label={t("colleagues.taskPrompt")}
                            minHeight={96}
                            maxHeight={240}
                            className="text-sm border-gray-200 dark:border-gray-700 dark:bg-gray-900"
                            autoFocus
                        />
                        <div className="mt-2 flex items-center justify-between">
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                {t(
                                    'Tip: include a time hint like "every weekday at 8am".',
                                )}
                            </p>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="min-h-10"
                                onClick={handleSuggest}
                                disabled={!prompt.trim() || isBusy}
                            >
                                {suggest.isPending ? (
                                    <Loader2 className="me-1.5 h-3.5 w-3.5 animate-spin" />
                                ) : (
                                    <Sparkles className="me-1.5 h-3.5 w-3.5" />
                                )}
                                {t("Suggest with AI")}
                            </Button>
                        </div>
                    </div>

                    {(hasSuggested || name) && (
                        <div className="space-y-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/30 p-3">
                            <div className="space-y-1.5">
                                <Label
                                    htmlFor="automation-name"
                                    className="text-xs"
                                >
                                    {t("Name")}
                                </Label>
                                <Input
                                    id="automation-name"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder={t("e.g. Daily news brief")}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label
                                    htmlFor="automation-description"
                                    className="text-xs"
                                >
                                    {t("Short description")}
                                </Label>
                                <Textarea
                                    id="automation-description"
                                    value={description}
                                    onChange={(e) =>
                                        setDescription(e.target.value)
                                    }
                                    placeholder={t("Optional one-liner")}
                                    className="min-h-[60px]"
                                />
                            </div>
                        </div>
                    )}

                    <div className="space-y-2">
                        <Label className="text-xs">{t("Output format")}</Label>
                        <div className="flex gap-2">
                            {[
                                {
                                    value: true,
                                    label: t("colleagues.richPage"),
                                },
                                { value: false, label: t("Text") },
                            ].map((opt) => (
                                <button
                                    key={String(opt.value)}
                                    type="button"
                                    onClick={() => setProducesHtml(opt.value)}
                                    aria-pressed={producesHtml === opt.value}
                                    className={cn(
                                        "inline-flex min-h-10 items-center rounded-full border px-3 py-1.5 text-sm transition",
                                        producesHtml === opt.value
                                            ? "border-sky-400 bg-sky-50 text-sky-700 dark:border-sky-500 dark:bg-sky-950/40 dark:text-sky-200"
                                            : "border-gray-200 text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700",
                                    )}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                            {t(
                                "Text is a plain summary. HTML produces a rich, interactive page.",
                            )}
                        </p>
                    </div>

                    <div className="space-y-2">
                        <Label className="text-xs">{t("Schedule")}</Label>
                        <SchedulePresetChips
                            value={presetId}
                            onChange={setPresetId}
                            showCustom={false}
                        />
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                            {t(
                                "You can fine-tune the schedule and timezone later.",
                            )}
                        </p>
                    </div>

                    <div className="flex items-center gap-2">
                        <Checkbox
                            id="automation-enabled"
                            checked={enabled}
                            onCheckedChange={(checked) =>
                                setEnabled(Boolean(checked))
                            }
                            disabled={presetId === "manual"}
                        />
                        <Label
                            htmlFor="automation-enabled"
                            className="text-sm font-normal text-gray-700 dark:text-gray-300"
                        >
                            {t("Enable on the schedule above")}
                        </Label>
                    </div>

                    {error && (
                        <div className="rounded-md bg-red-50 dark:bg-red-900/20 px-3 py-2 text-sm text-red-700 dark:text-red-300">
                            {error}
                        </div>
                    )}
                </div>

                <DialogFooter className="gap-2 sm:gap-2">
                    <Button
                        type="button"
                        variant="ghost"
                        onClick={() => onOpenChange(false)}
                        disabled={create.isPending}
                    >
                        {t("Cancel")}
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => handleSubmit(true)}
                        disabled={!canCreate}
                    >
                        {t("Create & customize")}
                    </Button>
                    <Button
                        type="button"
                        onClick={() => handleSubmit(false)}
                        disabled={!canCreate}
                    >
                        {create.isPending ? (
                            <Loader2 className="me-1.5 h-4 w-4 animate-spin" />
                        ) : null}
                        {t("Create")}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
