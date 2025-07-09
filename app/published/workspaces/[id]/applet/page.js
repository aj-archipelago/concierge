"use client";
import OutputSandbox from "@/src/components/sandbox/OutputSandbox";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useWorkspaceApplet } from "../../../../queries/workspaces";

export default function PublishedAppletPage() {
    const { id } = useParams();
    const appletQuery = useWorkspaceApplet(id);
    const [error, setError] = useState(null);
    const [publishedHtml, setPublishedHtml] = useState(null);

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
        <div className="w-full h-full bg-gray-100 flex items-center justify-center">
            <div className="w-full h-full bg-white">
                <OutputSandbox content={publishedHtml} height="100%" />
            </div>
        </div>
    );
}
