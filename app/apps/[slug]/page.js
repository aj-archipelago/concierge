"use client";
import { useParams } from "next/navigation";
import { useAppBySlug } from "../../queries/workspaces";
import PublishedAppletView from "@/src/components/PublishedAppletView";

export default function AppBySlugPage() {
    const { slug } = useParams();
    const appBySlugQuery = useAppBySlug(slug);

    const { data, isLoading, error } = appBySlugQuery;
    const applet = data?.applet;
    const app = data?.app;

    return (
        <PublishedAppletView
            applet={applet}
            app={app}
            isLoading={isLoading}
            error={error}
        />
    );
}
