"use client";

import { useTranslation } from "react-i18next";
import { useUserState } from "../../queries/users";
import { JsonViewer } from "../components/JsonViewer";

export default function UserStatePage() {
    const { t } = useTranslation();
    const { data: userState, isLoading, error } = useUserState();

    return (
        <div className="space-y-6">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-600 p-6">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                    {t("User State")}
                </h2>

                {isLoading ? (
                    <div className="text-center py-12">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-600 dark:border-sky-400 mx-auto"></div>
                        <p className="mt-4 text-sm text-gray-600 dark:text-gray-400">
                            {t("Loading...")}
                        </p>
                    </div>
                ) : error ? (
                    <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-4">
                        <p className="text-sm text-red-600 dark:text-red-400">
                            {t("Error loading user state")}: {error.message}
                        </p>
                    </div>
                ) : !userState || Object.keys(userState).length === 0 ? (
                    <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                            {t("No user state data available")}
                        </p>
                    </div>
                ) : (
                    <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 max-h-[600px] overflow-y-auto">
                        <div className="font-mono text-sm leading-relaxed">
                            <JsonViewer data={userState} />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
