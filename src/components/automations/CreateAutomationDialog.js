"use client";

import { useEffect, useState } from "react";
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
import SchedulePresetChips from "./SchedulePresetChips";
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
    const heading = name ? `# ${name}` : "# Automation";
    const body = prompt
        ? prompt
        : "Describe what Concierge should do when this automation runs.";
    return `${heading}\n\n${body}\n`;
}

const DEFAULT_PRESET = "manual";

export default function CreateAutomationDialog({
    open,
    onOpenChange,
    onCreated,
}) {
    const { t } = useTranslation();
    const [prompt, setPrompt] = useState("");
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [presetId, setPresetId] = useState(DEFAULT_PRESET);
    const [enabled, setEnabled] = useState(false);
    const [producesHtml, setProducesHtml] = useState(false);
    const [content, setContent] = useState("");
    const [hasSuggested, setHasSuggested] = useState(false);
    const [error, setError] = useState("");
    const [placeholderIndex] = useState(() =>
        Math.floor(Math.random() * PROMPT_PLACEHOLDERS.length),
    );

    const suggest = useSuggestAutomation();
    const create = useCreateAutomation();

    useEffect(() => {
        if (!open) {
            setPrompt("");
            setName("");
            setDescription("");
            setPresetId(DEFAULT_PRESET);
            setEnabled(false);
            setProducesHtml(false);
            setContent("");
            setHasSuggested(false);
            setError("");
        }
    }, [open]);

    const handleSuggest = async () => {
        setError("");
        if (!prompt.trim()) return;
        try {
            const suggestion = await suggest.mutateAsync(prompt.trim());
            setHasSuggested(true);
            if (!suggestion) {
                setError(
                    t(
                        "Couldn't generate a suggestion — fill in the details manually.",
                    ),
                );
                if (!name)
                    setName(prompt.trim().split(/\s+/).slice(0, 6).join(" "));
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
            name: finalName,
            slug: slugify(finalName),
            description: description.trim(),
            enabled,
            producesHtml,
            pinnedToSidebar: false,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
            schedule,
            content: content.trim() ? content : buildContent(finalName, prompt),
        };

        try {
            const created = await create.mutateAsync(payload);
            onCreated?.(created._id, { customize: openAfter });
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
            <DialogContent className="sm:max-w-xl">
                <DialogHeader>
                    <DialogTitle>{t("New automation")}</DialogTitle>
                    <DialogDescription>
                        {t(
                            "Describe what you want Concierge to do, and we'll fill in the rest.",
                        )}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    <div>
                        <AutosizeTextarea
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            placeholder={t(placeholder)}
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
