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
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-start">
                        <FileCode className="w-5 h-5 shrink-0" />
                        {t("Generate Applet")}
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 text-start">
                            {t("Describe the applet you want to create")}
                        </label>
                        <textarea
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            placeholder={t(
                                "generate_applet_prompt_placeholder",
                            )}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md resize-none focus:ring-2 focus:ring-sky-400 focus:border-sky-400 dark:focus:ring-sky-500 dark:focus:border-sky-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 text-start"
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

                    <div className="flex flex-row gap-2 justify-end">
                        <button
                            onClick={handleGenerate}
                            disabled={!prompt.trim()}
                            className="px-4 py-2 text-sm font-medium text-white bg-sky-600 rounded-md hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                        >
                            <Sparkles className="w-4 h-4 shrink-0" />
                            {t("Generate")}
                        </button>
                        <button
                            onClick={handleClose}
                            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
                        >
                            {t("Cancel")}
                        </button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
