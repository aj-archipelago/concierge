"use client";
import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";
import {
    useWorkspaceApp,
    useWorkspaceApplet,
} from "../../../../queries/workspaces";
import PublishedAppletView from "@/src/components/PublishedAppletView";

export default function PublishedAppletPage() {
    const { id } = useParams();
    const router = useRouter();
    const {
        data: app,
        isLoading: appLoading,
        error: appError,
    } = useWorkspaceApp(id);
    const {
        data: applet,
        isLoading: appletLoading,
        error: appletError,
    } = useWorkspaceApplet(id);

    const isLoading = appLoading || appletLoading;
    const error = appError || appletError;

    useEffect(() => {
        // If app exists and has a slug, redirect to slug-based route (app store case)
        if (!isLoading && !error && app?.slug) {
            router.replace(`/apps/${app.slug}`);
        }
    }, [app, isLoading, error, router]);

    // Show loading while we determine if we should redirect or render
    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-screen">
                <span>Loading...</span>
            </div>
        );
    }

    // If there's an app with a slug, we're redirecting (fallback - shouldn't render)
    if (app?.slug) {
        return (
            <div className="flex items-center justify-center h-screen">
                <span>Redirecting...</span>
            </div>
        );
    }

    // For non-app-store publishing: render applet directly from workspace
    // Check if applet has a published version
    if (applet && typeof applet.publishedVersionIndex === "number") {
        return (
            <PublishedAppletView
                key={applet._id || id}
                applet={applet}
                app={null} // No app document for non-app-store publishing
                isLoading={false}
                error={error}
            />
        );
    }

    // If there's an error or applet is not published, show error message
    return (
        <div className="flex items-center justify-center h-full text-red-600">
            <span>
                {error
                    ? "Failed to load applet."
                    : "This applet link is no longer valid. Please use the updated link."}
            </span>
        </div>
    );
}
