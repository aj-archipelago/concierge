"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Sparkles, FileCode } from "lucide-react";

const SUGGESTIONS = [
    "A vocabulary quiz with multiple choice questions and a score tracker",
    "Flashcards for memorizing key terms with flip animation",
    "A student grade calculator with letter grade display",
    "An interactive timeline of historical events",
    "A lesson reading progress tracker with completion checkboxes",
    "A math practice worksheet with instant answer checking",
];

export default function GenerateHtmlDialog({ show, onHide, onGenerate }) {
    const { t } = useTranslation();
    const [prompt, setPrompt] = useState("");

    const handleGenerate = () => {
        if (!prompt.trim()) return;
        onGenerate(prompt.trim());
        handleClose();
    };

    const handleClose = () => {
        setPrompt("");
        onHide();
    };

    return (
        <Dialog
            open={show}
            onOpenChange={(open) => {
                if (!open) handleClose();
            }}
        >
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-start">
                        <FileCode className="w-5 h-5 shrink-0" />
                        {t("Generate Applet")}
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                    <div>
                        <p className="mb-2 text-start text-sm text-gray-500 dark:text-gray-400">
                            {t(
                                "You can create quizzes, flashcards, calculators, trackers, timelines, forms, and more.",
                            )}
                        </p>
                        <div className="mb-3 flex flex-wrap gap-2">
                            {SUGGESTIONS.map((suggestion) => (
                                <button
                                    key={suggestion}
                                    type="button"
                                    onClick={() => setPrompt(t(suggestion))}
                                    className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs text-sky-700 transition-colors hover:border-sky-300 hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300 dark:hover:border-sky-700 dark:hover:bg-sky-900/40"
                                >
                                    <Sparkles className="h-3 w-3 shrink-0" />
                                    {t(suggestion)}
                                </button>
                            ))}
                        </div>
                        <label className="mb-2 block text-start text-sm font-medium text-gray-700 dark:text-gray-300">
                            {t("Describe the applet you want to create")}
                        </label>
                        <textarea
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            placeholder={t(
                                "generate_applet_prompt_placeholder",
                            )}
                            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-start text-gray-900 placeholder-gray-400 focus:border-sky-400 focus:ring-2 focus:ring-sky-400 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-500 dark:focus:border-sky-500 dark:focus:ring-sky-500"
                            dir="auto"
                            rows={4}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && e.ctrlKey) {
                                    e.preventDefault();
                                    handleGenerate();
                                }
                            }}
                        />
                    </div>

                    <div className="flex flex-row-reverse gap-2">
                        <button
                            onClick={handleGenerate}
                            disabled={!prompt.trim()}
                            className="flex items-center justify-center gap-2 rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            <Sparkles className="h-4 w-4 shrink-0" />
                            {t("Generate")}
                        </button>
                        <button
                            onClick={handleClose}
                            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                        >
                            {t("Cancel")}
                        </button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
