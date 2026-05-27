"use client";

import { useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { useDispatch } from "react-redux";
import {
    AppWindow,
    FolderPlus,
    Loader2,
    Trash2,
    Plus,
    Globe,
} from "lucide-react";
import * as Icons from "lucide-react";
import { toast } from "react-toastify";
import { openCanvas, setActiveCanvasChat } from "@/src/stores/chatSlice";
import { getTextProxyUrl } from "@/src/utils/proxyUrl";
import {
    deriveAppletName,
    launchAppletGeneration,
} from "@/src/utils/appletGeneration";
import FilterInput from "@/src/components/common/FilterInput";
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

dayjs.extend(relativeTime);

function toIdString(value) {
    if (!value) return null;
    if (typeof value === "object" && value._id) return String(value._id);
    return String(value);
}

export default function Applets() {
    const router = useRouter();
    const dispatch = useDispatch();
    const { t } = useTranslation();
    const { user } = useContext(AuthContext);
    const { direction = "ltr" } = useContext(LanguageContext) || {};
    const addChat = useAddChat();

    // Canvas applet registry state. The endpoint may return workspace-era
    // Applet documents for tool compatibility; this page only renders v2
    // records from that registry. Workspace-era applets render via workspaces.
    const [canvasApplets, setCanvasApplets] = useState([]);
    const [isLoadingCanvas, setIsLoadingCanvas] = useState(true);
    const [loadingAppletId, setLoadingAppletId] = useState(null);
    const [deletingAppletId, setDeletingAppletId] = useState(null);

    // Workspace applets.
    const { data: workspaces, isLoading: isLoadingWorkspaces } =
        useWorkspaces();
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
    useEffect(() => {
        if (!user?._id) return;

        const fetchApplets = async () => {
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
        };
        fetchApplets();
    }, [user?._id]);

    // Combine workspace-backed applets and canvas applets into a unified list.
    // Workspace rows are authoritative for v1/missing-version applets.
    const allApplets = useMemo(() => {
        const canvasItems = canvasApplets
            .filter((applet) => applet.version === 2)
            .map((applet) => {
                const appletId = toIdString(applet._id);

                return {
                    _id: appletId,
                    appletId,
                    workspaceId: null,
                    name: applet.name || "Untitled Applet",
                    type: "canvas",
                    source: "canvas",
                    canDelete: true,
                    icon: null,
                    updatedAt: applet.updatedAt,
                    filePath: applet.filePath,
                    raw: applet,
                };
            });

        const workspaceItems = (workspaces || []).map((ws) => ({
            _id: toIdString(ws._id),
            appletId: toIdString(ws.applet),
            workspaceId: toIdString(ws._id),
            name: ws.name || "Untitled Workspace",
            type: "workspace",
            source: "workspace",
            canDelete: false,
            icon: ws.publishedAppletIcon,
            hasPublishedApplet: ws.hasPublishedApplet,
            publishedAppletName: ws.publishedAppletName,
            hasPublishedPathway: ws.hasPublishedPathway,
            publishedPathwayName: ws.publishedPathwayName,
            slug: ws.slug,
            updatedAt: ws.updatedAt,
            raw: ws,
        }));

        const sortTimeMs = (item) => {
            const raw = item.updatedAt ?? item.raw?.createdAt;
            const ms = raw != null ? Date.parse(raw) : NaN;
            return Number.isFinite(ms) ? ms : 0;
        };

        // Sort all by updatedAt descending (safe for missing/invalid dates)
        return [...canvasItems, ...workspaceItems].sort(
            (a, b) => sortTimeMs(b) - sortTimeMs(a),
        );
    }, [canvasApplets, workspaces]);

    const filteredApplets = useMemo(() => {
        if (!debouncedFilterText) return allApplets;
        const query = debouncedFilterText.toLowerCase();
        return allApplets.filter((applet) => {
            return (
                (applet.name || "").toLowerCase().includes(query) ||
                (applet.slug || "").toLowerCase().includes(query) ||
                (applet.publishedAppletName || "").toLowerCase().includes(query)
            );
        });
    }, [allApplets, debouncedFilterText]);

    const createAppletChat = async (title) => {
        const chat = await addChat.mutateAsync({
            messages: [],
            title: title || t("New Applet"),
            forceNew: true,
            isUnused: false,
        });
        const chatId = toIdString(chat?._id);
        if (!chatId) {
            throw new Error("Chat creation returned no id");
        }
        return chatId;
    };

    const handleCanvasAppletClick = async (applet) => {
        try {
            setLoadingAppletId(applet._id);

            const appletId = applet.appletId || applet._id;
            let resolvedApplet = applet.raw || applet;
            let htmlContent = null;

            const appletRes = await fetch(`/api/canvas-applets/${appletId}`);
            if (appletRes.ok) {
                resolvedApplet = await appletRes.json();
            } else if (!resolvedApplet.filePath) {
                throw new Error(`Failed to fetch applet: ${appletRes.status}`);
            }

            if (resolvedApplet.filePath) {
                const response = await fetch(
                    getTextProxyUrl(resolvedApplet.filePath),
                );
                if (!response.ok) {
                    throw new Error(
                        `Failed to fetch applet: ${response.status}`,
                    );
                }
                htmlContent = await response.text();
            } else if (resolvedApplet.html) {
                htmlContent = resolvedApplet.html;
            } else {
                const versions = resolvedApplet.htmlVersions;
                htmlContent =
                    Array.isArray(versions) && versions.length > 0
                        ? versions[versions.length - 1].content
                        : "";
            }

            if (!htmlContent) {
                console.error("Applet has no file path or HTML content");
                return;
            }

            const title =
                resolvedApplet.name || applet.name || t("Untitled Applet");
            const chatId = await createAppletChat(title);

            dispatch(setActiveCanvasChat(chatId));

            dispatch(
                openCanvas({
                    type: "html",
                    title,
                    htmlContent,
                    url: resolvedApplet.filePath || undefined,
                    appletId,
                    workspacePath: resolvedApplet.workspacePath || null,
                    fileHash: resolvedApplet.fileHash || null,
                    blobPath: resolvedApplet.fileBlobPath || null,
                }),
            );

            router.push(`/chat/${chatId}`);
        } catch (error) {
            console.error("Error loading applet:", error);
        } finally {
            setLoadingAppletId(null);
        }
    };

    const handleWorkspaceAppletClick = (applet) => {
        if (applet.workspaceId) {
            router.push(`/workspaces/${applet.workspaceId}`);
            return;
        }

        console.error("Workspace applet has no workspace ID", applet);
    };

    const handleAppletClick = (applet) => {
        if (applet.type === "canvas") {
            handleCanvasAppletClick(applet);
        } else {
            handleWorkspaceAppletClick(applet);
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

    const isLoading = isLoadingCanvas || isLoadingWorkspaces;

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="h-8 w-8 animate-spin text-sky-600" />
            </div>
        );
    }

    return (
        <div className="pb-4" dir={direction}>
            <div className="mb-4">
                <div className="mb-4">
                    <h1 className="text-lg font-semibold">{t("Applets")}</h1>
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                        {debouncedFilterText
                            ? `${filteredApplets.length} ${t("matching")} ${t("applets")}`
                            : `${allApplets.length} ${t("applets")}`}
                    </div>
                </div>

                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
                    <FilterInput
                        value={filterText}
                        onChange={setFilterText}
                        onClear={() => {
                            setFilterText("");
                            setDebouncedFilterText("");
                        }}
                        placeholder={t("Search applets...")}
                        className="w-full sm:flex-1 sm:max-w-md"
                    />

                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto justify-end">
                        <TooltipProvider>
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
                        </TooltipProvider>
                    </div>
                </div>
            </div>

            {filteredApplets.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredApplets.map((applet) => (
                        <AppletCard
                            key={`${applet.source}-${applet._id}`}
                            applet={applet}
                            loadingAppletId={loadingAppletId}
                            deletingAppletId={deletingAppletId}
                            onClick={handleAppletClick}
                            onDelete={handleDeleteV2Applet}
                            t={t}
                        />
                    ))}
                </div>
            ) : (
                <EmptyState
                    icon={<AppWindow className="w-16 h-16 mx-auto" />}
                    title={
                        filterText ? t("No applets found") : t("No applets yet")
                    }
                    description={
                        filterText
                            ? t("Try adjusting your search or clear the filter")
                            : t("Create your first applet to get started")
                    }
                    action={
                        filterText
                            ? () => {
                                  setFilterText("");
                                  setDebouncedFilterText("");
                              }
                            : () => setShowGenerateDialog(true)
                    }
                    actionLabel={
                        filterText ? t("Clear Filter") : t("Create Applet")
                    }
                />
            )}

            <GenerateHtmlDialog
                show={showGenerateDialog}
                onHide={() => setShowGenerateDialog(false)}
                onGenerate={handleCreateApplet}
            />
        </div>
    );
}

function AppletCard({
    applet,
    loadingAppletId,
    deletingAppletId,
    onClick,
    onDelete,
    t,
}) {
    const isLoadingThis = loadingAppletId === applet._id;
    const isDeletingThis = deletingAppletId === applet._id;

    const IconComponent =
        applet.icon && Icons[applet.icon] ? Icons[applet.icon] : AppWindow;

    const updatedAt = applet.updatedAt
        ? dayjs(applet.updatedAt).fromNow()
        : null;

    return (
        <div
            className="group relative p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors cursor-pointer"
            onClick={() => !isLoadingThis && !isDeletingThis && onClick(applet)}
        >
            {(isLoadingThis || isDeletingThis) && (
                <div className="absolute inset-0 bg-white/60 dark:bg-gray-800/60 rounded-lg flex items-center justify-center z-10">
                    <Loader2 className="h-6 w-6 animate-spin text-sky-600" />
                </div>
            )}
            <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-10 h-10 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg flex-shrink-0">
                    <IconComponent className="w-5 h-5 text-gray-600 dark:text-gray-300" />
                </div>
                <div className="min-w-0 flex-1">
                    <h3 className="font-medium text-gray-900 dark:text-gray-100 truncate">
                        {applet.name}
                    </h3>
                    <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                            {applet.type === "canvas"
                                ? t("Canvas")
                                : t("Workspace")}
                        </span>
                        {applet.hasPublishedApplet && (
                            <span className="flex items-center gap-1 text-xs text-sky-600 dark:text-sky-400">
                                <Globe className="h-3 w-3" />
                                {t("Published")}
                            </span>
                        )}
                        {updatedAt && (
                            <span className="text-xs text-gray-400 dark:text-gray-500">
                                {updatedAt}
                            </span>
                        )}
                    </div>
                </div>
                {applet.canDelete && (
                    <button
                        onClick={(e) => onDelete(e, applet)}
                        className="flex-shrink-0 p-1.5 rounded-md text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 transition-opacity"
                        title={t("Delete applet")}
                        aria-label={t("Delete applet")}
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                )}
            </div>
        </div>
    );
}
