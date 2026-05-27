"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";

export default function DebugPage() {
    const { t } = useTranslation();
    const router = useRouter();

    useEffect(() => {
        // Redirect to user-info page by default
        router.replace("/debug/user-info");
    }, [router]);

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
            <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-600 dark:border-sky-400 mx-auto"></div>
                <p className="mt-2 text-gray-600 dark:text-gray-400">
                    {t("Redirecting...")}
                </p>
            </div>
        </div>
    );
}
