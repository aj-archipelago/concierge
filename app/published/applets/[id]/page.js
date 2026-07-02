"use client";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import PublishedAppletView from "@/src/components/PublishedAppletView";
import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";

export default function PublishedCanvasAppletPage() {
    const { t } = useTranslation();
    const { id } = useParams();
    const router = useRouter();
    const searchParams = useSearchParams();
    const [data, setData] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchApplet = async () => {
            try {
                const res = await fetch(`/api/published/applets/${id}`, {
                    credentials: "include",
                });
                if (res.status === 401) {
                    throw new Error("Unauthorized");
                }
                if (!res.ok) throw new Error("Failed to fetch");
                const json = await res.json();

                // Redirect to slug URL if app has a slug
                if (json.app?.slug) {
                    const query = searchParams.toString();
                    router.replace(
                        query
                            ? `/apps/${json.app.slug}?${query}`
                            : `/apps/${json.app.slug}`,
                    );
                    return;
                }

                setData(json);
            } catch (err) {
                setError(err);
            } finally {
                setIsLoading(false);
            }
        };
        fetchApplet();
    }, [id, router, searchParams]);

    if (isLoading) {
        return (
            <div
                className="flex h-screen items-center justify-center"
                role="status"
                aria-label={t("Loading applet...")}
            >
                <Loader2
                    className="h-8 w-8 animate-spin text-gray-400 dark:text-gray-500"
                    aria-hidden="true"
                />
            </div>
        );
    }

    if (data?.app?.slug) {
        return (
            <div className="flex items-center justify-center h-screen">
                <span>Redirecting...</span>
            </div>
        );
    }

    return (
        <PublishedAppletView
            key={data?.applet?._id || id}
            applet={data?.applet}
            app={data?.app}
            meta={data?.meta}
            isLoading={false}
            error={error}
        />
    );
}
