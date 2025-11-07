"use client";

import i18next from "i18next";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import config from "../../config";
import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogAction,
} from "@/components/ui/alert-dialog";

const Tos = ({ showTos, setShowTos }) => {
    const { getLogo, getTosContent } = config.global;
    const { language } = i18next;
    const { t } = useTranslation();
    const logo = getLogo(language);
    const tosContent = getTosContent(language);
    const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);

    const handleTosClose = () => {
        setHasScrolledToBottom(false);
        setShowTos(false);
        const rightNow = new Date(Date.now());
        localStorage.setItem("cortexWebShowTos", rightNow.toString());
    };

    const handleScroll = (e) => {
        const { scrollTop, scrollHeight, clientHeight } = e.target;
        // More forgiving scroll detection - allow 50px buffer from bottom
        const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;

        if (isAtBottom) {
            setHasScrolledToBottom(true);
        }
    };

    useEffect(() => {
        const shouldShowTos = checkShowTos();
        setShowTos(shouldShowTos);
    }, [setShowTos]);

    const checkShowTos = () => {
        const acceptDateString =
            typeof localStorage !== "undefined"
                ? localStorage.getItem("cortexWebShowTos")
                : null;

        if (acceptDateString && typeof acceptDateString === "string") {
            const acceptDate = new Date(acceptDateString);
            const thirtyDaysAgo = new Date(
                Date.now() - 30 * 24 * 60 * 60 * 1000,
            );
            if (acceptDate > thirtyDaysAgo) {
                return false;
            } else {
                return true;
            }
        } else {
            return true;
        }
    };

    return (
        <AlertDialog open={showTos} onOpenChange={setShowTos}>
            <AlertDialogContent className="max-h-[90vh] overflow-auto w-[65%] max-w-[800px] z-50">
                <AlertDialogHeader>
                    <div className="flex items-center gap-3 mb-2">
                        <img
                            src={logo}
                            height="48"
                            width="48"
                            alt="alert logo"
                            className="shrink-0"
                        />
                        <AlertDialogTitle className="text-xl md:text-xl">
                            {t("Terms of Service")}
                        </AlertDialogTitle>
                    </div>
                    <AlertDialogDescription asChild>
                        <div className="space-y-3">
                            {/* Scroll instruction */}
                            <div
                                className={`rounded-md p-3 mb-2 ${
                                    hasScrolledToBottom
                                        ? "bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800"
                                        : "bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800"
                                }`}
                            >
                                <div
                                    className={`flex items-center gap-2 ${
                                        hasScrolledToBottom
                                            ? "text-green-700 dark:text-green-300"
                                            : "text-sky-700 dark:text-sky-300"
                                    }`}
                                >
                                    {hasScrolledToBottom ? (
                                        <svg
                                            className="w-4 h-4"
                                            fill="none"
                                            stroke="currentColor"
                                            viewBox="0 0 24 24"
                                        >
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={2}
                                                d="M5 13l4 4L19 7"
                                            />
                                        </svg>
                                    ) : (
                                        <svg
                                            className="w-4 h-4"
                                            fill="none"
                                            stroke="currentColor"
                                            viewBox="0 0 24 24"
                                        >
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={2}
                                                d="M19 14l-7 7m0 0l-7-7m7 7V3"
                                            />
                                        </svg>
                                    )}
                                    <span className="text-sm font-medium">
                                        {hasScrolledToBottom
                                            ? t(
                                                  "Terms of Service read completely",
                                              )
                                            : t(
                                                  "Please scroll to the bottom to read the complete Terms of Service",
                                              )}
                                    </span>
                                </div>
                            </div>

                            <div
                                className="alert-text prose prose-sm max-w-none dark:prose-invert h-[400px] overflow-y-auto pr-4 border-2 border-gray-200 dark:border-gray-700 rounded-md p-4 scrollbar-thin scrollbar-thumb-gray-400 dark:scrollbar-thumb-gray-600 scrollbar-track-gray-100 dark:scrollbar-track-gray-800"
                                onScroll={handleScroll}
                            >
                                {tosContent}
                            </div>
                            <p className="alert-text prose prose-sm max-w-none dark:prose-invert">
                                {t("For more information, please review our")}{" "}
                                <a
                                    href="/privacy"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="underline text-sky-600 hover:text-sky-800"
                                >
                                    {t("Privacy Policy")}
                                </a>
                                .
                            </p>
                        </div>
                    </AlertDialogDescription>
                </AlertDialogHeader>

                <AlertDialogFooter>
                    <AlertDialogAction
                        onClick={handleTosClose}
                        disabled={!hasScrolledToBottom}
                        className={
                            !hasScrolledToBottom
                                ? "opacity-50 cursor-not-allowed"
                                : ""
                        }
                    >
                        {t("I Accept")}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
};

export default Tos;
