"use client";

import i18next from "i18next";
import { useEffect } from "react";
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

    const handleTosClose = () => {
        setShowTos(false);
        const rightNow = new Date(Date.now());
        localStorage.setItem("cortexWebShowTos", rightNow.toString());
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
                            height="40"
                            width="40"
                            alt="alert logo"
                            className="shrink-0"
                        />
                        <AlertDialogTitle className="text-lg md:text-base">
                            {t("Terms of Service")}
                        </AlertDialogTitle>
                    </div>
                    <AlertDialogDescription asChild>
                        <div className="space-y-3">
                            <div className="alert-text prose prose-sm max-w-none dark:prose-invert">
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
                    <AlertDialogAction onClick={handleTosClose}>
                        {t("I Accept")}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
};

export default Tos;
