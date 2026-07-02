"use client";

import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { useDispatch } from "react-redux";
import { useQueryClient } from "@tanstack/react-query";
import { AppWindow, FolderPlus, Loader2, Globe, Plus } from "lucide-react";
import * as Icons from "lucide-react";
import { toast } from "react-toastify";
import { setActiveCanvasChat } from "@/src/stores/chatSlice";
import {
    deriveAppletName,
    launchAppletGeneration,
} from "@/src/utils/appletGeneration";
import EmptyState from "@/src/components/common/EmptyState";
import { AuthContext } from "@/src/App";
import { LanguageContext } from "@/src/contexts/LanguageProvider";
import { useAddChat } from "../../queries/chats";
import { useCreateWorkspace, useWorkspaces } from "../../queries/workspaces";
import GenerateHtmlDialog from "@/src/components/chat/canvas/GenerateHtmlDialog";
import {
    Tooltip,
    TooltipTrigger,
    TooltipContent,
    TooltipProvider,
} from "@/components/ui/tooltip";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import {
    openCanvasAppletInChat,
    toAppletIdString,
} from "@/src/utils/openCanvasApplet";
import { useCurrentUser } from "../../queries/users";
import AppCatalogCard from "@/src/components/apps/AppCatalogCard";
import AppLibraryControlBar from "@/src/components/apps/AppLibraryControlBar";
import {
    AppletCardMenu,
    useAppletCardInteractionLock,
} from "@/src/components/apps/AppletCardActions";
import AppletPlacementBadges from "@/src/components/apps/AppletPlacementBadges";
import AppletMetadataDialog from "@/src/components/apps/AppletMetadataDialog";
import {
    APP_LIBRARY_SORT_OPTIONS,
    sortAppCatalogItems,
} from "@/src/components/apps/appCatalogUtils";

dayjs.extend(relativeTime);

function toIdString(value) {
    return toAppletIdString(value);
}

function getUserAppId(userApp) {
    const raw = userApp?.appId;
    if (!raw) return null;
    if (typeof raw === "object" && raw?._id) return String(raw._id);
    return String(raw);
}

function getUserAppAppletId(userApp) {
    const raw = userApp?.appId;
    if (!raw || typeof raw !== "object") return null;
    return toIdString(raw.appletId);
}

export default function Applets({ scope = "all" }) {
    const router = useRouter();
    const dispatch = useDispatch();
    const { t } = useTranslation();
    const { user } = useContext(AuthContext);
    const { direction = "ltr" } = useContext(LanguageContext) || {};
    const queryClient = useQueryClient();
    const addChat = useAddChat();
    const { data: currentUser } = useCurrentUser();
    const isSharedScope = scope === "shared";
    const isWorkspaceScope = scope === "workspaces";

    // Canvas applet registry state. The endpoint may return workspace-era
    // Applet documents for tool compatibility; this page only renders v2
    // records from that registry. Workspace-era applets render via workspaces.
    const [canvasApplets, setCanvasApplets] = useState([]);
    const [isLoadingCanvas, setIsLoadingCanvas] = useState(true);
    const [loadingAppletId, setLoadingAppletId] = useState(null);
    const [deletingAppletId, setDeletingAppletId] = useState(null);
    const [homeAppletId, setHomeAppletId] = useState(null);
    const [homeDirectoryAppletIds, setHomeDirectoryAppletIds] = useState([]);
    const [homeAppletPendingId, setHomeAppletPendingId] = useState(null);
    const [homeDirectoryPendingId, setHomeDirectoryPendingId] = useState(null);
    const [installingAppletId, setInstallingAppletId] = useState(null);
    const [metadataApplet, setMetadataApplet] = useState(null);
    const [migratingAppletName, setMigratingAppletName] = useState(null);
    const [openAppletMenuKey, setOpenAppletMenuKey] = useState(null);
    const [sortValue, setSortValue] = useState("updated-desc");

    // Workspace applets.
    const { data: workspaces, isLoading: isLoadingWorkspaces } = useWorkspaces({
        enabled: isWorkspaceScope,
    });
    const createWorkspace = useCreateWorkspace();

    const [filterText, setFilterText] = useState("");
    const [debouncedFilterText, setDebouncedFilterText] = useState("");
    const [showGenerateDialog, setShowGenerateDialog] = useState(false);

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedFilterText(filterText);
        }, 300);
        return () => clearTimeout(timer);
    }, [filterText]);

    // Fetch the applet registry.
    const fetchApplets = useCallback(async () => {
        if (!user?._id) return;
        try {
            const res = await fetch("/api/canvas-applets");
            if (!res.ok) throw new Error("Failed to fetch applets");
            const data = await res.json();
            setCanvasApplets(data.applets || []);
        } catch (error) {
            console.error("Error fetching canvas applets:", error);
        } finally {
            setIsLoadingCanvas(false);
        }
    }, [user?._id]);

    useEffect(() => {
        fetchApplets();
    }, [fetchApplets]);

    useEffect(() => {
        if (!user?._id || isSharedScope || isWorkspaceScope) return;

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
    }, [isSharedScope, isWorkspaceScope, user?._id]);

    const installedAppletAppsByAppletId = useMemo(() => {
        const entries = Array.isArray(currentUser?.apps)
            ? currentUser.apps
            : [];
        const installed = new Map();
        entries.forEach((entry) => {
            const appletId = getUserAppAppletId(entry);
            const appId = getUserAppId(entry);
            if (appletId && appId) {
                installed.set(appletId, appId);
            }
        });
        return installed;
    }, [currentUser?.apps]);

    // Combine canvas applets with workspace-backed applets. Regular workspaces
    // live in their own scope so My Applets stays focused on current canvas applets.
    const allApplets = useMemo(() => {
        const canvasItems = isWorkspaceScope
            ? []
            : canvasApplets
                  .filter((applet) => applet.version === 2)
                  .map((applet) => {
                      const appletId = toIdString(applet._id);
                      const app = applet.app || null;
                      const latestVersionIndex = Array.isArray(
                          applet.htmlVersions,
                      )
                          ? applet.htmlVersions.length - 1
                          : null;

                      return {
                          _id: appletId,
                          appletId,
                          workspaceId: null,
                          name: app?.name || applet.name || "Untitled Applet",
                          type: "canvas",
                          source: "canvas",
                          canDelete: applet.isOwner !== false,
                          isShared: Boolean(applet.isShared),
                          isSharedOut:
                              applet.isSharedOut === undefined
                                  ? undefined
                                  : Boolean(applet.isSharedOut),
                          shareRole: applet.shareRole || "editor",
                          isHome: homeAppletId === appletId,
                          isHomeDirectory:
                              homeDirectoryAppletIds.includes(appletId),
                          isInstalled:
                              installedAppletAppsByAppletId.has(appletId),
                          installedAppId:
                              installedAppletAppsByAppletId.get(appletId) ||
                              null,
                          icon: app?.icon || null,
                          app,
                          description: app?.description || null,
                          imageUrl: app?.imageUrl || null,
                          imageLightUrl: app?.imageLightUrl || null,
                          imageDarkUrl: app?.imageDarkUrl || null,
                          imageAlt: app?.imageAlt || null,
                          tags: Array.isArray(app?.tags) ? app.tags : [],
                          category: app?.category || null,
                          badgeLabel: app?.badgeLabel || null,
                          latestVersionIndex,
                          publishedVersionIndex:
                              typeof applet.publishedVersionIndex === "number"
                                  ? applet.publishedVersionIndex
                                  : null,
                          updatedAt: applet.updatedAt,
                          filePath: applet.filePath,
                          raw: applet,
                      };
                  })
                  .filter((applet) =>
                      isSharedScope ? applet.isShared : !applet.isShared,
                  );
        const canvasAppletIds = new Set(
            canvasApplets
                .filter((applet) => applet.version === 2)
                .map((applet) => toIdString(applet._id))
                .filter(Boolean),
        );

        const workspaceItems = isWorkspaceScope
            ? (workspaces || []).map((ws) => {
                  const appletId = toIdString(ws.applet);
                  const isMigratedWorkspace =
                      Boolean(appletId) && canvasAppletIds.has(appletId);
                  const isLegacyApplet =
                      Boolean(appletId) && !isMigratedWorkspace;

                  return {
                      _id: toIdString(ws._id),
                      appletId: isLegacyApplet ? appletId : null,
                      workspaceId: toIdString(ws._id),
                      name: isLegacyApplet
                          ? ws.publishedAppletName ||
                            ws.name ||
                            t("Untitled Applet")
                          : ws.name || t("Untitled Workspace"),
                      type: isLegacyApplet ? "legacy" : "workspace",
                      source: "workspace",
                      canDelete: false,
                      isInstalled: false,
                      installedAppId: null,
                      hasUnmigratedApplet: isLegacyApplet,
                      isAppletDependency: isMigratedWorkspace,
                      icon: isLegacyApplet ? ws.publishedAppletIcon : "Folder",
                      hasPublishedApplet: isLegacyApplet
                          ? ws.hasPublishedApplet
                          : false,
                      publishedAppletName: isLegacyApplet
                          ? ws.publishedAppletName
                          : null,
                      hasPublishedPathway: isLegacyApplet
                          ? ws.hasPublishedPathway
                          : false,
                      publishedPathwayName: isLegacyApplet
                          ? ws.publishedPathwayName
                          : null,
                      slug: ws.slug,
                      updatedAt: ws.updatedAt,
                      raw: ws,
                  };
              })
            : [];

        const sortTimeMs = (item) => {
            const raw = item.updatedAt ?? item.raw?.createdAt;
            const ms = raw != null ? Date.parse(raw) : NaN;
            return Number.isFinite(ms) ? ms : 0;
        };

        // Sort all by updatedAt descending (safe for missing/invalid dates)
        return [...canvasItems, ...workspaceItems].sort(
            (a, b) => sortTimeMs(b) - sortTimeMs(a),
        );
    }, [
        canvasApplets,
        homeAppletId,
        homeDirectoryAppletIds,
        installedAppletAppsByAppletId,
        isSharedScope,
        isWorkspaceScope,
        t,
        workspaces,
    ]);

    const filteredApplets = useMemo(() => {
        const searchedApplets = debouncedFilterText
            ? allApplets.filter((applet) => {
                  const query = debouncedFilterText.toLowerCase();
                  return (
                      (applet.name || "").toLowerCase().includes(query) ||
                      (applet.slug || "").toLowerCase().includes(query) ||
                      (applet.publishedAppletName || "")
                          .toLowerCase()
                          .includes(query) ||
                      (applet.description || "")
                          .toLowerCase()
                          .includes(query) ||
                      (applet.category || "").toLowerCase().includes(query) ||
                      (applet.tags || []).some((tag) =>
                          String(tag).toLowerCase().includes(query),
                      )
                  );
              })
            : allApplets;

        return sortAppCatalogItems(searchedApplets, sortValue, {
            getName: (applet) => applet.name || "",
            getUpdatedAt: (applet) =>
                applet.updatedAt ||
                applet.raw?.updatedAt ||
                applet.raw?.createdAt,
        });
    }, [allApplets, debouncedFilterText, sortValue]);

    const createAppletChat = async (title) => {
        const chat = await addChat.mutateAsync({
            messages: [],
            title: title || t("New Applet"),
        });
        const chatId = toIdString(chat?._id);
        if (!chatId) {
            throw new Error("Chat creation returned no id");
        }
        return chatId;
    };

    const handleCanvasAppletClick = async (
        applet,
        { keepLoadingOnSuccess = false } = {},
    ) => {
        let opened = false;
        try {
            setLoadingAppletId(applet._id);
            await openCanvasAppletInChat({
                appletId: applet.appletId || applet._id,
                fallbackApplet: applet.raw || applet,
                addChat,
                dispatch,
                router,
                t,
            });
            opened = true;
        } catch (error) {
            console.error("Error loading applet:", error);
            throw error;
        } finally {
            if (!opened || !keepLoadingOnSuccess) {
                setLoadingAppletId(null);
            }
        }
    };

    const handleWorkspaceAppletClick = async (applet) => {
        try {
            setLoadingAppletId(applet._id);
            setMigratingAppletName(applet.name || t("Untitled Applet"));
            const response = await fetch("/api/canvas-applets/migrate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    workspaceId: applet.workspaceId,
                    appletId: applet.appletId,
                }),
            });
            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                throw new Error(data.error || "Failed to migrate applet");
            }

            const migrated = await response.json();
            await handleCanvasAppletClick(
                {
                    ...applet,
                    _id: migrated.appletId,
                    appletId: migrated.appletId,
                    type: "canvas",
                    source: "canvas",
                    raw: migrated.applet || {
                        _id: migrated.appletId,
                        filePath: migrated.filePath,
                        workspacePath: migrated.workspacePath,
                        fileHash: migrated.fileHash,
                        fileBlobPath: migrated.fileBlobPath,
                        name: applet.name,
                    },
                },
                { keepLoadingOnSuccess: true },
            );
        } catch (error) {
            console.error("Error migrating applet:", error);
            toast.error(
                error.message ||
                    t("Failed to open applet. Please try again.") ||
                    "Failed to open applet. Please try again.",
            );
            setMigratingAppletName(null);
            setLoadingAppletId(null);
        }
    };

    const handleAppletClick = (applet) => {
        if (applet.type === "canvas") {
            handleCanvasAppletClick(applet);
        } else if (applet.type === "legacy") {
            handleWorkspaceAppletClick(applet);
        } else if (applet.workspaceId) {
            router.push(`/workspaces/${applet.workspaceId}`);
        }
    };

    const handleDeleteV2Applet = async (e, applet) => {
        e.stopPropagation();
        const name = applet.name || "Untitled Applet";
        if (
            !window.confirm(
                t('Are you sure you want to delete "{{name}}"?', { name }),
            )
        ) {
            return;
        }

        try {
            const appletId = applet.appletId || applet._id;
            setDeletingAppletId(applet._id);
            const res = await fetch(`/api/canvas-applets/${appletId}`, {
                method: "DELETE",
            });
            if (!res.ok) throw new Error("Failed to delete applet");
            setCanvasApplets((prev) =>
                prev.filter((a) => toIdString(a._id) !== toIdString(appletId)),
            );
        } catch (error) {
            console.error("Error deleting applet:", error);
        } finally {
            setDeletingAppletId(null);
        }
    };

    const handleToggleHomeApplet = async (e, applet) => {
        e.stopPropagation();
        const appletId = applet.appletId || applet._id;
        if (!appletId) return;

        const isCurrentHome = homeAppletId === toIdString(appletId);
        try {
            setHomeAppletPendingId(applet._id);
            const res = await fetch("/api/users/me/home-applet", {
                method: isCurrentHome ? "DELETE" : "PUT",
                headers: { "Content-Type": "application/json" },
                ...(isCurrentHome
                    ? {}
                    : { body: JSON.stringify({ appletId }) }),
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
        } finally {
            setHomeAppletPendingId(null);
        }
    };

    const handleToggleHomeDirectory = async (e, applet) => {
        e.stopPropagation();
        const appletId = applet.appletId || applet._id;
        const appletIdString = toIdString(appletId);
        if (!appletIdString) return;

        const isInDirectory = homeDirectoryAppletIds.includes(appletIdString);
        try {
            setHomeDirectoryPendingId(applet._id);
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
        } finally {
            setHomeDirectoryPendingId(null);
        }
    };

    const handleToggleAppletInstall = async (e, applet) => {
        e.stopPropagation();
        const appletId = applet.appletId || applet._id;
        if (!appletId || applet.type === "workspace") return;

        try {
            setInstallingAppletId(applet._id);
            const response = await fetch(
                `/api/canvas-applets/${appletId}/install`,
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
        } finally {
            setInstallingAppletId(null);
        }
    };

    const handleEditMetadata = (e, applet) => {
        e.stopPropagation();
        setMetadataApplet(applet);
    };

    const handleMetadataSaved = async (updatedApplet) => {
        if (updatedApplet?._id) {
            setCanvasApplets((current) =>
                current.map((applet) =>
                    toIdString(applet._id) === toIdString(updatedApplet._id)
                        ? updatedApplet
                        : applet,
                ),
            );
        } else {
            await fetchApplets();
        }
        await queryClient.invalidateQueries({ queryKey: ["currentUser"] });
    };

    const handleCreateApplet = async (prompt) => {
        if (!user?.contextId) {
            toast.error(
                t("Unable to create file: User context not available") ||
                    "Unable to create file: User context not available",
            );
            return;
        }

        let chatId;
        let appletName;
        try {
            appletName = deriveAppletName(prompt);
            chatId = await createAppletChat(appletName);
            dispatch(setActiveCanvasChat(chatId));
        } catch (error) {
            console.error("Error creating applet chat:", error);
            toast.error(
                error.message ||
                    t("Failed to create chat. Please try again.") ||
                    "Failed to create chat. Please try again.",
            );
            return;
        }

        const { completion } = launchAppletGeneration({
            prompt,
            dispatch,
            userContextId: user.contextId,
            appletName,
            onError: (error) => {
                console.error("Error generating applet:", error);
                toast.error(
                    error.message ||
                        t("Failed to generate applet. Please try again.") ||
                        "Failed to generate applet. Please try again.",
                );
            },
            onSaveError: (error) => {
                console.error("Error saving generated applet:", error);
                toast.error(
                    t(
                        "Applet generated, but saving failed. Please try again.",
                    ) ||
                        "Applet generated, but saving failed. Please try again.",
                );
            },
        });

        void completion.catch(() => {});
        router.push(`/chat/${chatId}`);
    };

    const handleCreateWorkspace = async () => {
        try {
            const workspace = await createWorkspace.mutateAsync({
                name: t("New Workspace"),
            });
            router.push(`/workspaces/${workspace._id}`);
        } catch (error) {
            console.error("Error creating workspace:", error);
            toast.error(
                error.message ||
                    t("Failed to create workspace. Please try again.") ||
                    "Failed to create workspace. Please try again.",
            );
        }
    };

    const isLoading =
        isLoadingCanvas || (isWorkspaceScope && isLoadingWorkspaces);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="h-8 w-8 animate-spin text-sky-600" />
            </div>
        );
    }

    return (
        <div className="pb-4" dir={direction}>
            {migratingAppletName && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/40 dark:bg-black/60 p-4"
                    role="status"
                    aria-live="polite"
                >
                    <div className="w-full max-w-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-5 py-6 text-center shadow-xl">
                        <Loader2 className="mx-auto h-8 w-8 animate-spin text-sky-600 dark:text-sky-400" />
                        <div className="mt-4 text-sm font-medium text-gray-900 dark:text-gray-100">
                            {t("Migrating applet...")}
                        </div>
                        <div className="mt-1 truncate text-sm text-gray-500 dark:text-gray-400">
                            {migratingAppletName}
                        </div>
                    </div>
                </div>
            )}
            <AppLibraryControlBar
                searchValue={filterText}
                onSearchChange={(event) => setFilterText(event.target.value)}
                onClearSearch={() => {
                    setFilterText("");
                    setDebouncedFilterText("");
                }}
                searchPlaceholder={
                    isWorkspaceScope
                        ? t("Search workspaces...")
                        : t("Search applets...")
                }
                countLabel={
                    debouncedFilterText
                        ? `${filteredApplets.length} ${t("matching")}`
                        : isSharedScope
                          ? `${allApplets.length} ${t("shared applets")}`
                          : isWorkspaceScope
                            ? `${allApplets.length} ${t("Workspaces")}`
                            : `${allApplets.length} ${t("Applets")}`
                }
                sortValue={sortValue}
                onSortChange={(event) => setSortValue(event.target.value)}
                sortOptions={APP_LIBRARY_SORT_OPTIONS}
                sortLabel={t("Sort:")}
                actions={
                    isSharedScope ? null : (
                        <TooltipProvider>
                            {isWorkspaceScope && (
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <button
                                            type="button"
                                            className="lb-secondary inline-flex items-center justify-center gap-2 min-h-10 px-3"
                                            onClick={handleCreateWorkspace}
                                            disabled={createWorkspace.isPending}
                                            aria-label={t("Create Workspace")}
                                            title={t("Create Workspace")}
                                        >
                                            {createWorkspace.isPending ? (
                                                <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                                            ) : (
                                                <FolderPlus className="h-4 w-4 shrink-0" />
                                            )}
                                            <span className="text-sm">
                                                {t("Create Workspace")}
                                            </span>
                                        </button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        {t("Create Workspace")}
                                    </TooltipContent>
                                </Tooltip>
                            )}
                            {!isSharedScope && !isWorkspaceScope && (
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <button
                                            type="button"
                                            className="lb-primary inline-flex items-center justify-center gap-2 min-h-10 px-3"
                                            onClick={() =>
                                                setShowGenerateDialog(true)
                                            }
                                            disabled={addChat.isPending}
                                            aria-label={t("Create Applet")}
                                            title={t("Create Applet")}
                                        >
                                            <Plus className="h-4 w-4 shrink-0" />
                                            <span className="text-sm">
                                                {t("Create Applet")}
                                            </span>
                                        </button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        {t("Create Applet")}
                                    </TooltipContent>
                                </Tooltip>
                            )}
                        </TooltipProvider>
                    )
                }
            />

            {filteredApplets.length > 0 ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {filteredApplets.map((applet) => {
                        const menuKey = `${applet.source}-${applet._id}`;
                        return (
                            <AppletCard
                                key={menuKey}
                                applet={applet}
                                loadingAppletId={loadingAppletId}
                                deletingAppletId={deletingAppletId}
                                homeAppletPendingId={homeAppletPendingId}
                                homeDirectoryPendingId={homeDirectoryPendingId}
                                installingAppletId={installingAppletId}
                                isMenuOpen={openAppletMenuKey === menuKey}
                                onClick={handleAppletClick}
                                onDelete={handleDeleteV2Applet}
                                onToggleHome={handleToggleHomeApplet}
                                onToggleHomeDirectory={
                                    handleToggleHomeDirectory
                                }
                                onToggleInstall={handleToggleAppletInstall}
                                onEditMetadata={handleEditMetadata}
                                onMenuOpenChange={(open) =>
                                    setOpenAppletMenuKey((currentKey) =>
                                        open
                                            ? menuKey
                                            : currentKey === menuKey
                                              ? null
                                              : currentKey,
                                    )
                                }
                                direction={direction}
                                t={t}
                            />
                        );
                    })}
                </div>
            ) : (
                <EmptyState
                    icon={<AppWindow className="w-16 h-16 mx-auto" />}
                    title={
                        filterText
                            ? t("No applets found")
                            : isWorkspaceScope
                              ? t("No workspaces found")
                              : isSharedScope
                                ? t("No shared applets yet")
                                : t("No applets yet")
                    }
                    description={
                        filterText
                            ? t("Try adjusting your search or clear the filter")
                            : isWorkspaceScope
                              ? t("Create your first workspace to get started")
                              : isSharedScope
                                ? t("Applets shared with you will appear here.")
                                : t("Create your first applet to get started")
                    }
                    action={
                        filterText
                            ? () => {
                                  setFilterText("");
                                  setDebouncedFilterText("");
                              }
                            : isSharedScope
                              ? null
                              : isWorkspaceScope
                                ? handleCreateWorkspace
                                : () => setShowGenerateDialog(true)
                    }
                    actionLabel={
                        filterText
                            ? t("Clear Filter")
                            : isWorkspaceScope
                              ? t("Create Workspace")
                              : t("Create Applet")
                    }
                />
            )}

            <GenerateHtmlDialog
                show={showGenerateDialog}
                onHide={() => setShowGenerateDialog(false)}
                onGenerate={handleCreateApplet}
            />
            <AppletMetadataDialog
                applet={metadataApplet}
                isOpen={Boolean(metadataApplet)}
                onClose={() => setMetadataApplet(null)}
                onSaved={handleMetadataSaved}
            />
        </div>
    );
}

function AppletCard({
    applet,
    loadingAppletId,
    deletingAppletId,
    homeAppletPendingId,
    homeDirectoryPendingId,
    installingAppletId,
    onClick,
    onDelete,
    onEditMetadata,
    onToggleHome,
    onToggleHomeDirectory,
    onToggleInstall,
    isMenuOpen = false,
    onMenuOpenChange,
    direction,
    t,
}) {
    const { isInteractionHeld, suppressInteractionMotion, holdInteraction } =
        useAppletCardInteractionLock();
    const isLoadingThis = loadingAppletId === applet._id;
    const isDeletingThis = deletingAppletId === applet._id;
    const isHomePendingThis = homeAppletPendingId === applet._id;
    const isHomeDirectoryPendingThis = homeDirectoryPendingId === applet._id;
    const isInstallingThis = installingAppletId === applet._id;
    const isBusy =
        isLoadingThis ||
        isDeletingThis ||
        isHomePendingThis ||
        isHomeDirectoryPendingThis ||
        isInstallingThis;

    const IconComponent =
        applet.icon && Icons[applet.icon] ? Icons[applet.icon] : AppWindow;

    const updatedAt = applet.updatedAt
        ? dayjs(applet.updatedAt).fromNow()
        : null;
    const publishedVersionLabel =
        applet.publishedVersionIndex != null
            ? t("Published v{{version}}", {
                  version: applet.publishedVersionIndex + 1,
              })
            : applet.latestVersionIndex != null
              ? t("Saved v{{version}}", {
                    version: applet.latestVersionIndex + 1,
                })
              : t("Draft");
    return (
        <AppCatalogCard
            icon={IconComponent}
            title={applet.name}
            titleAttribute={applet.name}
            imageUrl={applet.imageUrl}
            imageLightUrl={applet.imageLightUrl}
            imageDarkUrl={applet.imageDarkUrl}
            imageAlt={applet.imageAlt || applet.name}
            imageBadge={applet.badgeLabel || applet.category}
            imageMeta={null}
            imageOverlayVariant="app-library"
            description={applet.description}
            chips={[
                applet.category,
                ...(Array.isArray(applet.tags) ? applet.tags : []),
            ]}
            badge={<AppletPlacementBadges applet={applet} />}
            meta={[
                applet.hasPublishedApplet ? (
                    <>
                        <Globe className="h-3 w-3 text-white/75" />
                        <span className="text-white/75">{t("Published")}</span>
                    </>
                ) : null,
                applet.hasUnmigratedApplet ? t("Unmigrated applet") : null,
                applet.isAppletDependency ? t("Applet dependency") : null,
                applet.isShared ? (
                    <span className="text-white/75">{t("Shared")}</span>
                ) : null,
            ]}
            footer={
                updatedAt ? (
                    <span className="truncate">
                        {applet.type === "canvas"
                            ? `${publishedVersionLabel} - `
                            : ""}
                        {t("Updated")} {updatedAt}
                    </span>
                ) : null
            }
            topRightActions={
                <AppletCardMenu
                    applet={applet}
                    direction={direction}
                    open={isMenuOpen}
                    onEditMetadata={onEditMetadata}
                    onToggleInstall={onToggleInstall}
                    onToggleHome={onToggleHome}
                    onToggleHomeDirectory={onToggleHomeDirectory}
                    onDelete={onDelete}
                    onOpenChange={onMenuOpenChange}
                    onActionStart={holdInteraction}
                />
            }
            imageActionsAlwaysVisible
            isBusy={isBusy}
            isInteractionActive={isMenuOpen || isInteractionHeld}
            suppressInteractionMotion={suppressInteractionMotion}
            density="compact"
            onClick={() => !isBusy && onClick(applet)}
        />
    );
}
