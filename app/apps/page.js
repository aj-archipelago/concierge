"use client";

import { cn } from "@/lib/utils";
import * as Icons from "lucide-react";
import { AppWindow } from "lucide-react";
import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import { LanguageContext } from "@/src/contexts/LanguageProvider";
import { useCurrentUser } from "../queries/users";
import axios from "../utils/axios-client";
import AppCatalogCard from "@/src/components/apps/AppCatalogCard";
import {
    AppletCardMenu,
    useAppletCardInteractionLock,
} from "@/src/components/apps/AppletCardActions";
import AppletPlacementBadges from "@/src/components/apps/AppletPlacementBadges";
import AppLibraryControlBar from "@/src/components/apps/AppLibraryControlBar";
import {
    APP_LIBRARY_SORT_OPTIONS,
    filterApps,
    sortAppCatalogItems,
} from "@/src/components/apps/appCatalogUtils";
import Applets from "../applets/components/Applets";

const APP_LIBRARY_TABS = [
    { value: "discover", label: "Discover" },
    { value: "my-applets", label: "My Applets" },
    { value: "shared", label: "Shared With Me" },
    { value: "workspaces", label: "Workspaces" },
];

const APP_LIBRARY_TAB_VALUES = new Set(
    APP_LIBRARY_TABS.map((tab) => tab.value),
);

const NATIVE_APP_HREF_BY_SLUG = {
    automations: "/automations",
    chat: "/chat",
    home: "/home",
    jira: "/code/jira",
    media: "/media",
    video: "/video",
    workspaces: "/apps?tab=my-applets",
    write: "/write",
};

function resolveCanvasAppletId(app) {
    const raw = app?.appletId;
    if (!raw) return null;
    if (typeof raw === "object" && raw?._id) return String(raw._id);
    return String(raw);
}

function resolveWorkspaceId(app) {
    const raw = app?.workspaceId;
    if (!raw) return null;
    if (typeof raw === "object" && raw?._id) return String(raw._id);
    return String(raw);
}

function toIdString(value) {
    if (!value) return null;
    if (typeof value === "object" && value?._id) return String(value._id);
    return String(value);
}

function getUserAppId(userApp) {
    return toIdString(userApp?.appId);
}

function getUserAppAppletId(userApp) {
    const raw = userApp?.appId;
    if (!raw || typeof raw !== "object") return null;
    return toIdString(raw.appletId);
}

function getAppIcon(app) {
    return app?.icon && Icons[app.icon] ? Icons[app.icon] : AppWindow;
}

function getAppDisplayName(app) {
    if (app?.slug === "workspaces") return "Applets";
    return app?.name || "";
}

function getAppletVersionLabel(app, t) {
    const applet = app?.appletId;
    if (!applet || typeof applet !== "object") return null;
    if (typeof applet.publishedVersionIndex === "number") {
        return t("Published v{{version}}", {
            version: applet.publishedVersionIndex + 1,
        });
    }
    if (Array.isArray(applet.htmlVersions) && applet.htmlVersions.length > 0) {
        return t("Saved v{{version}}", {
            version: applet.htmlVersions.length,
        });
    }
    return t("Draft");
}

function toDiscoverAppletMenuModel(
    app,
    { homeAppletId, homeDirectoryAppletIds, installedAppletAppsByAppletId },
) {
    const appletId = resolveCanvasAppletId(app);
    if (!appletId) return null;

    return {
        _id: appletId,
        appletId,
        type: "canvas",
        name: app?.appletId?.name || getAppDisplayName(app),
        canEditMetadata: false,
        canDelete: false,
        isHome: homeAppletId === appletId,
        isHomeDirectory: homeDirectoryAppletIds.includes(appletId),
        isInstalled: installedAppletAppsByAppletId.has(appletId),
        installedAppId: installedAppletAppsByAppletId.get(appletId) || null,
        app,
    };
}

function AppCatalogSection({ apps, children }) {
    if (!apps.length) return null;

    return (
        <section>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {children}
            </div>
        </section>
    );
}

function AppCard({
    app,
    direction,
    homeAppletId,
    homeDirectoryAppletIds,
    installedAppletAppsByAppletId,
    isMenuOpen = false,
    onOpen,
    onMenuOpenChange,
    onToggleHome,
    onToggleHomeDirectory,
    onToggleInstall,
}) {
    const { t } = useTranslation();
    const { isInteractionHeld, suppressInteractionMotion, holdInteraction } =
        useAppletCardInteractionLock();
    const IconComponent = getAppIcon(app);
    const appName = getAppDisplayName(app);
    const isNative = app.type === "native";
    const updatedAt = app.updatedAt ? new Date(app.updatedAt) : null;
    const appletVersionLabel = getAppletVersionLabel(app, t);
    const footerItems = !isNative
        ? [
              appletVersionLabel,
              updatedAt
                  ? `${t("Updated")} ${updatedAt.toLocaleDateString()}`
                  : null,
          ].filter(Boolean)
        : [];
    const menuApplet = toDiscoverAppletMenuModel(app, {
        homeAppletId,
        homeDirectoryAppletIds,
        installedAppletAppsByAppletId,
    });

    return (
        <AppCatalogCard
            icon={IconComponent}
            title={t(appName)}
            titleAttribute={t(appName)}
            imageUrl={isNative ? null : app.imageUrl}
            imageLightUrl={isNative ? null : app.imageLightUrl}
            imageDarkUrl={isNative ? null : app.imageDarkUrl}
            imageAlt={isNative ? null : app.imageAlt || appName}
            imageBadge={isNative ? null : app.badgeLabel || app.category}
            imageMeta={null}
            imageOverlayVariant={isNative ? "default" : "app-library"}
            density={isNative ? "native" : "normal"}
            badge={
                menuApplet ? (
                    <AppletPlacementBadges applet={menuApplet} />
                ) : null
            }
            meta={[]}
            chips={
                isNative
                    ? []
                    : [
                          app.category,
                          ...(Array.isArray(app.tags) ? app.tags : []),
                      ]
            }
            description={
                app.type === "native" ? t(app.description) : app.description
            }
            footer={
                footerItems.length > 0 ? (
                    <span className="truncate">{footerItems.join(" - ")}</span>
                ) : null
            }
            topRightActions={
                !isNative && menuApplet ? (
                    <AppletCardMenu
                        applet={menuApplet}
                        direction={direction}
                        open={isMenuOpen}
                        onToggleHome={onToggleHome}
                        onToggleHomeDirectory={onToggleHomeDirectory}
                        onToggleInstall={onToggleInstall}
                        onOpenChange={onMenuOpenChange}
                        onActionStart={holdInteraction}
                    />
                ) : null
            }
            imageActionsAlwaysVisible={!isNative}
            isInteractionActive={isMenuOpen || isInteractionHeld}
            suppressInteractionMotion={suppressInteractionMotion}
            onClick={onOpen}
        />
    );
}

export default function AppsPage() {
    const { t } = useTranslation();
    const router = useRouter();
    const searchParams = useSearchParams();
    const queryClient = useQueryClient();
    const { direction = "ltr" } = useContext(LanguageContext) || {};
    const { data: currentUser, isLoading } = useCurrentUser();
    const [availableApps, setAvailableApps] = useState([]);
    const [homeAppletId, setHomeAppletId] = useState(null);
    const [homeDirectoryAppletIds, setHomeDirectoryAppletIds] = useState([]);
    const [openAppletMenuKey, setOpenAppletMenuKey] = useState(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [sortValue, setSortValue] = useState("updated-desc");
    const requestedTab = searchParams.get("tab") || "discover";
    const activeTab = APP_LIBRARY_TAB_VALUES.has(requestedTab)
        ? requestedTab
        : "discover";
    const shouldLoadCatalog = activeTab === "discover";

    const fetchAvailableApps = useCallback(async () => {
        try {
            const response = await axios.get("/api/apps");
            setAvailableApps(
                (Array.isArray(response.data) ? response.data : []).filter(
                    (app) => app.type === "applet",
                ),
            );
        } catch (error) {
            console.error("Error fetching available apps:", error);
        }
    }, []);

    useEffect(() => {
        if (!shouldLoadCatalog) return;
        fetchAvailableApps();
    }, [fetchAvailableApps, shouldLoadCatalog]);

    useEffect(() => {
        if (!shouldLoadCatalog || !currentUser?._id) return;

        const fetchHomeApplet = async () => {
            try {
                const res = await fetch("/api/users/me/home-applet");
                if (!res.ok) return;
                const data = await res.json();
                setHomeAppletId(toIdString(data.homeAppletId));
                setHomeDirectoryAppletIds(
                    Array.isArray(data.homeAppletIds)
                        ? data.homeAppletIds.map(toIdString).filter(Boolean)
                        : [],
                );
            } catch (error) {
                console.error("Error fetching home applet:", error);
            }
        };

        fetchHomeApplet();
    }, [currentUser?._id, shouldLoadCatalog]);

    const installedAppletAppsByAppletId = useMemo(() => {
        const installed = new Map();
        const entries = Array.isArray(currentUser?.apps)
            ? currentUser.apps
            : [];

        entries.forEach((entry) => {
            const appletId = getUserAppAppletId(entry);
            const appId = getUserAppId(entry);
            if (appletId && appId) {
                installed.set(appletId, appId);
            }
        });

        return installed;
    }, [currentUser?.apps]);

    const appletApps = useMemo(() => {
        const filteredApps = filterApps(availableApps, searchQuery, {
            getDisplayName: getAppDisplayName,
        });
        return sortAppCatalogItems(filteredApps, sortValue, {
            getName: getAppDisplayName,
            getUpdatedAt: (app) =>
                app.updatedAt || app.appletId?.updatedAt || app.createdAt,
        });
    }, [availableApps, searchQuery, sortValue]);

    const handleTabChange = (nextTab) => {
        const params = new URLSearchParams(searchParams.toString());
        if (nextTab === "discover") {
            params.delete("tab");
        } else {
            params.set("tab", nextTab);
        }
        const query = params.toString();
        router.push(query ? `/apps?${query}` : "/apps");
    };

    const openApp = (app) => {
        if (app.type === "applet") {
            const canvasId = resolveCanvasAppletId(app);
            const workspaceId = resolveWorkspaceId(app);
            const isListed = app.listedInStore !== false;
            if (app.slug && isListed) {
                router.push(`/apps/${app.slug}`);
            } else if (canvasId) {
                router.push(`/apps/private/${canvasId}`);
            } else if (workspaceId) {
                router.push(`/published/workspaces/${workspaceId}/applet`);
            }
            return;
        }

        if (app.slug) {
            router.push(NATIVE_APP_HREF_BY_SLUG[app.slug] || `/${app.slug}`);
        }
    };

    const handleToggleHomeApplet = async (e, applet) => {
        e.stopPropagation();
        const appletId = applet.appletId || applet._id;
        const appletIdString = toIdString(appletId);
        if (!appletIdString) return;

        const isCurrentHome = homeAppletId === appletIdString;
        try {
            const res = await fetch("/api/users/me/home-applet", {
                method: isCurrentHome ? "DELETE" : "PUT",
                headers: { "Content-Type": "application/json" },
                ...(isCurrentHome
                    ? {}
                    : { body: JSON.stringify({ appletId: appletIdString }) }),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(
                    data.error ||
                        (isCurrentHome
                            ? t("Failed to clear home applet")
                            : t("Failed to set home applet")),
                );
            }
            const data = await res.json();
            setHomeAppletId(toIdString(data.homeAppletId));
        } catch (error) {
            console.error("Error updating home applet:", error);
            toast.error(
                error.message ||
                    t("Failed to update home applet. Please try again.") ||
                    "Failed to update home applet. Please try again.",
            );
        }
    };

    const handleToggleHomeDirectory = async (e, applet) => {
        e.stopPropagation();
        const appletIdString = toIdString(applet.appletId || applet._id);
        if (!appletIdString) return;

        const isInDirectory = homeDirectoryAppletIds.includes(appletIdString);
        try {
            const res = await fetch("/api/users/me/home-applet-directory", {
                method: isInDirectory ? "DELETE" : "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ appletId: appletIdString }),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(
                    data.error ||
                        (isInDirectory
                            ? t("Failed to remove applet from Home")
                            : t("Failed to add applet to Home")),
                );
            }
            const data = await res.json();
            setHomeDirectoryAppletIds(
                Array.isArray(data.homeAppletIds)
                    ? data.homeAppletIds.map(toIdString).filter(Boolean)
                    : [],
            );
        } catch (error) {
            console.error("Error updating home applet directory:", error);
            toast.error(
                error.message ||
                    t("Failed to update Home applets. Please try again.") ||
                    "Failed to update Home applets. Please try again.",
            );
        }
    };

    const handleToggleAppletInstall = async (e, applet) => {
        e.stopPropagation();
        const appletIdString = toIdString(applet.appletId || applet._id);
        if (!appletIdString) return;

        try {
            const response = await fetch(
                `/api/canvas-applets/${appletIdString}/install`,
                {
                    method: applet.isInstalled ? "DELETE" : "POST",
                },
            );
            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                throw new Error(
                    data.error ||
                        (applet.isInstalled
                            ? t("Failed to remove applet from sidebar")
                            : t("Failed to add applet to sidebar")),
                );
            }
            await queryClient.invalidateQueries({ queryKey: ["currentUser"] });
        } catch (error) {
            console.error("Error updating applet install:", error);
            toast.error(
                error.message ||
                    t("Failed to update sidebar applet. Please try again.") ||
                    "Failed to update sidebar applet. Please try again.",
            );
        }
    };

    const renderAppCard = (app) => {
        const menuKey = `discover-${resolveCanvasAppletId(app) || app._id}`;
        return (
            <AppCard
                key={app._id}
                app={app}
                direction={direction}
                homeAppletId={homeAppletId}
                homeDirectoryAppletIds={homeDirectoryAppletIds}
                installedAppletAppsByAppletId={installedAppletAppsByAppletId}
                isMenuOpen={openAppletMenuKey === menuKey}
                onOpen={() => openApp(app)}
                onMenuOpenChange={(open) =>
                    setOpenAppletMenuKey((currentKey) =>
                        open
                            ? menuKey
                            : currentKey === menuKey
                              ? null
                              : currentKey,
                    )
                }
                onToggleHome={handleToggleHomeApplet}
                onToggleHomeDirectory={handleToggleHomeDirectory}
                onToggleInstall={handleToggleAppletInstall}
            />
        );
    };

    if (isLoading) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-900">
                <div className="text-center">
                    <div className="mx-auto h-8 w-8 animate-spin rounded-full border-b-2 border-sky-600"></div>
                    <p className="mt-2 text-gray-600 dark:text-gray-300">
                        {t("Loading...")}
                    </p>
                </div>
            </div>
        );
    }

    return (
        <main className="min-h-screen bg-gray-50 dark:bg-gray-900">
            <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
                <div className="mb-3">
                    <h1 className="text-xl font-semibold tracking-tight text-gray-950 dark:text-gray-50">
                        {t("Applet Library")}
                    </h1>
                    <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                        {t(
                            "Browse public applets and manage your own applets from one library.",
                        )}
                    </p>
                </div>

                <div className="mb-4 flex gap-2 overflow-x-auto border-b border-gray-200 dark:border-gray-800">
                    {APP_LIBRARY_TABS.map((tab) => (
                        <button
                            key={tab.value}
                            type="button"
                            className={cn(
                                "min-h-10 shrink-0 border-b-2 px-3 text-sm font-medium transition",
                                activeTab === tab.value
                                    ? "border-sky-500 text-sky-700 dark:text-sky-300"
                                    : "border-transparent text-gray-500 hover:text-gray-950 dark:text-gray-400 dark:hover:text-gray-100",
                            )}
                            onClick={() => handleTabChange(tab.value)}
                        >
                            {t(tab.label)}
                        </button>
                    ))}
                </div>

                {activeTab === "discover" && (
                    <>
                        <AppLibraryControlBar
                            searchValue={searchQuery}
                            onSearchChange={(event) =>
                                setSearchQuery(event.target.value)
                            }
                            onClearSearch={() => setSearchQuery("")}
                            searchPlaceholder={t("Search applets...")}
                            countLabel={
                                searchQuery
                                    ? `${appletApps.length} ${t("matching")}`
                                    : `${appletApps.length} ${t("Applets")}`
                            }
                            sortValue={sortValue}
                            onSortChange={(event) =>
                                setSortValue(event.target.value)
                            }
                            sortOptions={APP_LIBRARY_SORT_OPTIONS}
                            sortLabel={t("Sort:")}
                        />
                        <div className="space-y-8">
                            <AppCatalogSection apps={appletApps}>
                                {appletApps.map(renderAppCard)}
                            </AppCatalogSection>

                            {appletApps.length === 0 && (
                                <div className="rounded-lg border border-dashed border-gray-300 bg-white p-10 text-center dark:border-gray-700 dark:bg-gray-800">
                                    <AppWindow className="mx-auto h-10 w-10 text-gray-300 dark:text-gray-600" />
                                    <h2 className="mt-3 text-base font-semibold text-gray-950 dark:text-gray-50">
                                        {t("No applets found")}
                                    </h2>
                                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                                        {t("Try a different search.")}
                                    </p>
                                </div>
                            )}
                        </div>
                    </>
                )}

                {activeTab === "my-applets" && <Applets />}
                {activeTab === "workspaces" && <Applets scope="workspaces" />}
                {activeTab === "shared" && <Applets scope="shared" />}
            </div>
        </main>
    );
}
