"use client";
import OutputSandbox from "@/src/components/sandbox/OutputSandbox";
import { useParams } from "next/navigation";
import { useEffect, useState, useContext } from "react";
import { useWorkspaceApplet, useWorkspaceApp } from "../../../../queries/workspaces";
import { useCurrentUser, useUpdateCurrentUser } from "../../../../queries/users";
import { ThemeContext } from "@/src/contexts/ThemeProvider";
import { Plus, Check } from "lucide-react";
import { useTranslation } from "react-i18next";

export default function PublishedAppletPage() {
    const { id } = useParams();
    const { theme } = useContext(ThemeContext);
    const { t } = useTranslation();
    const appletQuery = useWorkspaceApplet(id);
    const { data: app } = useWorkspaceApp(id);
    const { data: currentUser } = useCurrentUser();
    const updateUser = useUpdateCurrentUser();
    const [error, setError] = useState(null);
    const [publishedHtml, setPublishedHtml] = useState(null);
    const [isAdding, setIsAdding] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);

    // Debug logging
    console.log("App data:", app);
    console.log("App ID:", app?._id);

    useEffect(() => {
        if (appletQuery.isLoading) return;

        if (appletQuery.error) {
            setError(
                "Failed to load applet. Please ensure that you have the correct link.",
            );
            return;
        }

        const applet = appletQuery.data;
        if (!applet) return;

        const { publishedVersionIndex, htmlVersions } = applet;

        if (
            typeof publishedVersionIndex !== "number" ||
            !htmlVersions ||
            !htmlVersions[publishedVersionIndex]
        ) {
            setError("This applet is not published.");
            setPublishedHtml(null);
        } else {
            setError(null);
            setPublishedHtml(htmlVersions[publishedVersionIndex].content);
        }
    }, [appletQuery.data, appletQuery.isLoading, appletQuery.error]);

    // Check if app is installed
    const isAppInstalled = currentUser?.apps?.some(
        (userApp) =>
            userApp.appId === app?._id ||
            (typeof userApp.appId === "object" && userApp.appId && userApp.appId._id === app?._id),
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

    if (appletQuery.isLoading) {
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
        <div className="w-full h-full bg-gray-100 flex items-center justify-center relative">
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
            
            <div className="w-full h-full bg-white">
                <OutputSandbox
                    content={publishedHtml}
                    height="100%"
                    theme={theme}
                />
            </div>
        </div>
    );
}
