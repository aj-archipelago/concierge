"use client";

import { Home, LayoutGrid, PanelLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AppCatalogBadge } from "@/src/components/apps/AppCatalogCard";

export default function AppletPlacementBadges({ applet }) {
    const { t } = useTranslation();

    if (!applet) return null;

    const badges = [];

    if (applet.isInstalled) {
        badges.push({
            key: "sidebar",
            tone: "sky",
            icon: PanelLeft,
            label: t("In sidebar"),
        });
    }

    if (applet.type === "canvas" && applet.isHomeDirectory) {
        badges.push({
            key: "home-directory",
            tone: "violet",
            icon: LayoutGrid,
            label: t("On Home"),
        });
    }

    if (applet.type === "canvas" && applet.isHome) {
        badges.push({
            key: "home-applet",
            tone: "emerald",
            icon: Home,
            label: t("Home applet"),
        });
    }

    if (!badges.length) return null;

    return (
        <div className="flex max-w-full flex-wrap items-center justify-end gap-1">
            {badges.map(({ key, tone, icon, label }) => (
                <AppCatalogBadge key={key} tone={tone} icon={icon}>
                    {label}
                </AppCatalogBadge>
            ))}
        </div>
    );
}
