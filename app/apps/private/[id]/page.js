"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import PublishedAppletView from "@/src/components/PublishedAppletView";

async function fetchPrivateAppletRuntime(id) {
    const response = await fetch(`/api/canvas-applets/${id}/runtime`, {
        cache: "no-store",
    });
    if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Failed to load applet");
    }
    return response.json();
}

export default function PrivateAppletPage() {
    const { id } = useParams();
    const query = useQuery({
        queryKey: ["privateAppletRuntime", id],
        queryFn: () => fetchPrivateAppletRuntime(id),
        enabled: !!id,
    });

    return (
        <PublishedAppletView
            key={query.data?.applet?._id || id}
            applet={query.data?.applet}
            app={query.data?.app}
            isLoading={query.isLoading}
            error={query.error}
        />
    );
}
