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
    const meta = data?.meta;

    return (
        <PublishedAppletView
            key={applet?._id || app?._id || slug}
            applet={applet}
            app={app}
            meta={meta}
            isLoading={isLoading}
            error={error}
        />
    );
}
