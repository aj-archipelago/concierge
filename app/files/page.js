"use client";

import { Loader2 } from "lucide-react";
import { useContext } from "react";
import { useTranslation } from "react-i18next";
import { LanguageContext } from "../../src/contexts/LanguageProvider";
import UserFileCollection from "../workspaces/[id]/components/UserFileCollection";
import { useCurrentUser } from "../queries/users";

export default function FilesPage() {
    const { t } = useTranslation();
    const { direction } = useContext(LanguageContext);
    const { data: currentUser, isLoading } = useCurrentUser();
    const contextId = currentUser?.contextId || null;
    const contextKey = currentUser?.contextKey || null;

    return (
        <main
            dir={direction}
            className="flex h-full min-h-0 flex-col bg-white text-gray-900 dark:bg-gray-900 dark:text-gray-100"
        >
            <header className="shrink-0 border-b border-gray-200 px-4 py-3 dark:border-gray-700 sm:px-6">
                <h1 className="text-lg font-semibold leading-7">
                    {t("Files")}
                </h1>
            </header>
            <section className="min-h-0 flex-1 p-2 sm:p-4">
                {isLoading || !contextId ? (
                    <div className="flex h-full min-h-64 items-center justify-center">
                        <Loader2 className="h-6 w-6 animate-spin text-gray-500 dark:text-gray-400" />
                    </div>
                ) : (
                    <UserFileCollection
                        contextId={contextId}
                        contextKey={contextKey}
                        containerHeight="100%"
                        persistenceKey="files-page"
                    />
                )}
            </section>
        </main>
    );
}
