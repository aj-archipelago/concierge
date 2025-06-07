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
        const isAtBottom =
            Math.abs(scrollHeight - scrollTop - clientHeight) < 1;
        setHasScrolledToBottom(isAtBottom);
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
                                    className="underline text-blue-600 hover:text-blue-800"
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
