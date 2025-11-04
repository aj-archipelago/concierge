"use client";
import OutputSandbox from "@/src/components/sandbox/OutputSandbox";
import { useEffect, useState, useContext } from "react";
import { useCurrentUser, useUpdateCurrentUser } from "../../app/queries/users";
import { ThemeContext } from "@/src/contexts/ThemeProvider";
import { Plus, Check } from "lucide-react";
import { useTranslation } from "react-i18next";

export default function PublishedAppletView({
    applet,
    app,
    isLoading,
    error: appletError,
}) {
    const { theme } = useContext(ThemeContext);
    const { t } = useTranslation();
    const { data: currentUser } = useCurrentUser();
    const updateUser = useUpdateCurrentUser();
    const [error, setError] = useState(null);
    const [publishedHtml, setPublishedHtml] = useState(null);
    const [isAdding, setIsAdding] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);

    useEffect(() => {
        if (isLoading) return;

        if (appletError) {
            setError(
                "Failed to load applet. Please ensure that you have the correct link.",
            );
            return;
        }

        if (!applet) return;

        const { publishedVersionIndex, htmlVersions } = applet;

        if (
            typeof publishedVersionIndex !== "number" ||
            !htmlVersions ||
            !htmlVersions[publishedVersionIndex]
        ) {
            setError("This applet is not published.");
            setPublishedHtml(null);
            return;
        }

        setError(null);
        setPublishedHtml(htmlVersions[publishedVersionIndex].content);
    }, [applet, isLoading, appletError, app]);

    // Check if app is installed
    const isAppInstalled = currentUser?.apps?.some(
        (userApp) =>
            userApp.appId === app?._id ||
            (typeof userApp.appId === "object" &&
                userApp.appId &&
                userApp.appId._id === app?._id),
    );

    const handleAddApp = async () => {
        if (!app || isAdding) return;

        setIsAdding(true);
        try {
            const newApp = {
                appId: app._id,
                order: currentUser?.apps?.length || 0,
                addedAt: new Date(),
            };

            const updatedApps = [...(currentUser?.apps || []), newApp];
            await updateUser.mutateAsync({
                data: { apps: updatedApps },
            });

            // Show success indicator for 3 seconds then fade out
            setShowSuccess(true);
            setTimeout(() => {
                setShowSuccess(false);
            }, 3000);
        } catch (error) {
            console.error("Error adding app:", error);
        } finally {
            setIsAdding(false);
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-screen">
                <span>Loading...</span>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex items-center justify-center h-full text-red-600">
                <span>{error}</span>
            </div>
        );
    }

    return (
        <div className="w-full h-full relative">
            {/* Add App Button */}
            {app && app._id && !isAppInstalled && (
                <button
                    onClick={handleAddApp}
                    disabled={isAdding}
                    className="absolute top-4 right-4 z-10 w-10 h-10 flex items-center justify-center rounded-full bg-sky-500 hover:bg-sky-600 text-white shadow-lg transition-colors disabled:opacity-50"
                    title={t("Add to my apps")}
                >
                    {isAdding ? (
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                        <Plus className="w-5 h-5" />
                    )}
                </button>
            )}

            {/* Success indicator */}
            {app && app._id && isAppInstalled && showSuccess && (
                <div className="absolute top-4 right-4 z-10 w-10 h-10 flex items-center justify-center rounded-full bg-green-500 text-white shadow-lg transition-opacity duration-500">
                    <Check className="w-5 h-5" />
                </div>
            )}

            <OutputSandbox
                key={applet?._id || app?._id || publishedHtml}
                content={publishedHtml}
                height="100%"
                theme={theme}
            />
        </div>
    );
}
