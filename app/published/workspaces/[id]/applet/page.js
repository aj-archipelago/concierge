"use client";
import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useWorkspaceApp } from "../../../../queries/workspaces";

export default function PublishedAppletPage() {
    const { id } = useParams();
    const router = useRouter();
    const { data: app, isLoading, error } = useWorkspaceApp(id);

    useEffect(() => {
        if (!isLoading && !error && app?.slug) {
            // Redirect to the new slug-based route
            router.replace(`/apps/${app.slug}`);
        }
    }, [app, isLoading, error, router]);

    // Show loading while we determine if we should redirect
    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-screen">
                <span>Loading...</span>
            </div>
        );
    }

    // If there's an error or no app slug, show error message
    if (error || !app?.slug) {
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

    // This should not render as useEffect should redirect first,
    // but keeping as fallback
    return (
        <div className="flex items-center justify-center h-screen">
            <span>Redirecting...</span>
        </div>
    );
}
