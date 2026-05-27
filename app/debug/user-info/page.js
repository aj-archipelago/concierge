"use client";

import { useTranslation } from "react-i18next";
import { useCurrentUser } from "../../queries/users";

export default function UserInfoPage() {
    const { t } = useTranslation();
    const { data: currentUser, isLoading } = useCurrentUser();

    if (isLoading) {
        return (
            <div className="text-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-600 dark:border-sky-400 mx-auto"></div>
                <p className="mt-4 text-sm text-gray-600 dark:text-gray-400">
                    {t("Loading...")}
                </p>
            </div>
        );
    }

    if (!currentUser) {
        return (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-600 p-6">
                <p className="text-gray-600 dark:text-gray-400">
                    {t("Please log in to view debug data.")}
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-600 p-6">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                    {t("User Information")}
                </h2>
                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                                {t("User ID")}
                            </p>
                            <p className="text-sm font-mono text-gray-900 dark:text-gray-100 break-all">
                                {currentUser._id || t("N/A")}
                            </p>
                        </div>
                        <div>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                                {t("Username")}
                            </p>
                            <p className="text-sm text-gray-900 dark:text-gray-100 break-all">
                                {currentUser.username || t("N/A")}
                            </p>
                        </div>
                        <div>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                                {t("Email")}
                            </p>
                            <p className="text-sm text-gray-900 dark:text-gray-100 break-all">
                                {currentUser.email || t("N/A")}
                            </p>
                        </div>
                        <div>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                                {t("Context ID")}
                            </p>
                            <p className="text-sm font-mono text-gray-900 dark:text-gray-100 break-all">
                                {currentUser.contextId || t("N/A")}
                            </p>
                        </div>
                        {currentUser.contextKey && (
                            <div>
                                <p className="text-sm text-gray-600 dark:text-gray-400">
                                    {t("Context Key")}
                                </p>
                                <p className="text-sm font-mono text-gray-900 dark:text-gray-100 break-all">
                                    {currentUser.contextKey}
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
