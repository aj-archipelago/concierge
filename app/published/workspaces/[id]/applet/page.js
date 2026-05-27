"use client";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import PublishedAppletView from "@/src/components/PublishedAppletView";

export default function PublishedAppletPage() {
    const { id } = useParams();
    const router = useRouter();
    const searchParams = useSearchParams();
    const [data, setData] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const app = data?.app;
    const applet = data?.applet;

    useEffect(() => {
        const fetchApplet = async () => {
            try {
                const res = await fetch(
                    `/api/published/workspaces/${encodeURIComponent(id)}/applet`,
                );
                if (!res.ok) throw new Error("Failed to fetch applet");
                const json = await res.json();
                setData(json);
            } catch (err) {
                setError(err);
            } finally {
                setIsLoading(false);
            }
        };

        if (id) {
            fetchApplet();
        }
    }, [id]);

    useEffect(() => {
        if (!isLoading && !error && app?.slug) {
            const query = searchParams.toString();
            router.replace(
                query ? `/apps/${app.slug}?${query}` : `/apps/${app.slug}`,
            );
        }
    }, [app, isLoading, error, router, searchParams]);

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

    if (applet && typeof applet.publishedVersionIndex === "number") {
        return (
            <PublishedAppletView
                key={applet._id || id}
                applet={applet}
                app={null}
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
