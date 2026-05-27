"use client";

import Link from "next/link";
import { Suspense, useContext } from "react";
import { useSearchParams } from "next/navigation";
import { AlertCircle, MessageCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { LanguageContext } from "../../../src/contexts/LanguageProvider";

const ERROR_COPY = {
    slack_not_configured: {
        title: "auth_error_slack_not_configured_title",
        description: "auth_error_slack_not_configured_description",
    },
    atlassian_not_configured: {
        title: "auth_error_atlassian_not_configured_title",
        description: "auth_error_atlassian_not_configured_description",
    },
    unauthorized: {
        title: "auth_error_unauthorized_title",
        description: "auth_error_unauthorized_description",
    },
    oauth_failed: {
        title: "auth_error_oauth_failed_title",
        description: "auth_error_oauth_failed_description",
    },
    access_denied: {
        title: "auth_error_access_denied_title",
        description: "auth_error_access_denied_description",
    },
};

function AuthErrorContent() {
    const { t } = useTranslation();
    const { direction = "ltr" } = useContext(LanguageContext) || {};
    const searchParams = useSearchParams();
    const error = searchParams.get("error") || "oauth_failed";
    const message = searchParams.get("message");
    const copy = ERROR_COPY[error] || {
        title: "auth_error_generic_title",
        description: "auth_error_generic_description",
    };

    return (
        <main
            dir={direction}
            className="min-h-screen bg-gray-50 px-4 py-10 text-gray-900 dark:bg-gray-950 dark:text-gray-100 sm:px-6"
        >
            <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-xl items-center">
                <section className="w-full rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900 sm:p-8">
                    <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-300">
                        <AlertCircle className="h-6 w-6" aria-hidden="true" />
                    </div>
                    <h1 className="text-2xl font-semibold tracking-normal">
                        {t(copy.title)}
                    </h1>
                    <p className="mt-3 text-start text-sm leading-6 text-gray-600 dark:text-gray-300">
                        {message || t(copy.description)}
                    </p>
                    <div className="mt-4 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-400">
                        <span className="font-medium">
                            {t("auth_error_code_label")}:
                        </span>{" "}
                        <code>{error}</code>
                    </div>
                    <div className="mt-6">
                        <Link
                            href="/chat"
                            className="inline-flex min-h-10 items-center gap-2 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-950 dark:hover:bg-gray-200"
                        >
                            <MessageCircle
                                className="h-4 w-4"
                                aria-hidden="true"
                            />
                            {t("auth_error_back_to_chat")}
                        </Link>
                    </div>
                </section>
            </div>
        </main>
    );
}

export default function AuthErrorPage() {
    return (
        <Suspense
            fallback={
                <main className="min-h-screen bg-gray-50 px-4 py-10 dark:bg-gray-950 sm:px-6" />
            }
        >
            <AuthErrorContent />
        </Suspense>
    );
}
