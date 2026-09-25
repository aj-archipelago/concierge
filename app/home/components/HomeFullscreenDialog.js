"use client";

import { useContext, useRef } from "react";
import { Dialog } from "@headlessui/react";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { LanguageContext } from "@/src/contexts/LanguageProvider";

export default function HomeFullscreenDialog({
    title,
    onClose,
    children,
    testId,
    compact = false,
    actions,
}) {
    const { t } = useTranslation();
    const { direction = "ltr" } = useContext(LanguageContext) || {};
    const closeRef = useRef(null);
    return (
        <Dialog
            open
            onClose={onClose}
            initialFocus={closeRef}
            dir={direction}
            data-testid={testId}
            className="relative z-50"
        >
            {compact && (
                <div
                    className="fixed inset-0 bg-gray-950/50 dark:bg-black/70"
                    aria-hidden="true"
                />
            )}
            <div
                className={
                    compact
                        ? "fixed inset-0 flex items-end justify-center p-2 sm:items-center sm:p-4"
                        : "fixed inset-0"
                }
            >
                <Dialog.Panel
                    dir={direction}
                    className={
                        compact
                            ? "flex max-h-[calc(100dvh-1rem)] w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-white text-gray-900 shadow-xl dark:bg-gray-900 dark:text-gray-100 sm:max-h-[90dvh]"
                            : "flex h-full flex-col bg-white text-gray-900 dark:bg-gray-900 dark:text-gray-100"
                    }
                >
                    <div className="flex min-h-14 shrink-0 items-start gap-3 border-b border-gray-200 bg-white px-4 py-2 dark:border-gray-700 dark:bg-gray-800">
                        <Dialog.Title className="min-w-0 flex-1 break-words py-2 text-base font-semibold">
                            {title}
                        </Dialog.Title>
                        {actions}
                        <button
                            ref={closeRef}
                            type="button"
                            onClick={onClose}
                            aria-label={t("Close")}
                            title={t("Close")}
                            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-100"
                        >
                            <X className="h-5 w-5" aria-hidden="true" />
                        </button>
                    </div>
                    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                        {children}
                    </div>
                </Dialog.Panel>
            </div>
        </Dialog>
    );
}
