"use client";

import { cn } from "@/lib/utils";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
    DndContext,
    DragOverlay,
    KeyboardSensor,
    PointerSensor,
    rectIntersection,
    useSensor,
    useSensors,
} from "@dnd-kit/core";
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import * as Icons from "lucide-react";
import { AppWindow, GripVertical, X, Plus, Edit } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useRouter } from "next/navigation";
import { useCurrentUser, useUpdateCurrentUser } from "../queries/users";
import axios from "../utils/axios-client";
import { Search } from "lucide-react";

function SortableAppItem({ app, onRemove, isCollapsed }) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({
        id:
            typeof app.appId === "object" && app.appId
                ? app.appId._id
                : app.appId || `temp-${Math.random()}`,
    });
    const { t } = useTranslation();

    const style = {
        transform: CSS.Transform.toString(transform),
        transition: transition || "transform 200ms ease",
    };

    // Get app details from the populated appId field
    const appDetails = app.appId;
    const appName = appDetails?.name || "";

    // Get icon component
    const IconComponent = appDetails?.icon
        ? Icons[appDetails.icon] || AppWindow
        : AppWindow;

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={cn(
                "flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg mb-2",
                isDragging && "opacity-50 shadow-lg",
            )}
        >
            <div className="flex items-center gap-3">
                <button
                    {...attributes}
                    {...listeners}
                    className="cursor-grab active:cursor-grabbing p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                >
                    <GripVertical className="h-4 w-4 text-gray-400" />
                </button>
                <div className="flex items-center gap-2">
                    <div className="flex items-center justify-center w-10 h-10 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg flex-shrink-0">
                        <IconComponent className="w-5 h-5 text-gray-600 dark:text-gray-300" />
                    </div>
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                        {t(appName)}
                    </span>
                </div>
            </div>
            <button
                onClick={() =>
                    onRemove(
                        typeof app.appId === "object" && app.appId
                            ? app.appId._id
                            : app.appId,
                    )
                }
                className="p-1 hover:bg-red-100 hover:text-red-600 rounded"
            >
                <X className="h-4 w-4" />
            </button>
        </div>
    );
}

export default function AppsPage() {
    const { t } = useTranslation();
    const router = useRouter();
    const { data: currentUser, isLoading } = useCurrentUser();
    const updateUser = useUpdateCurrentUser();
    const [userApps, setUserApps] = useState([]);
    const [availableApps, setAvailableApps] = useState([]);
    const [activeId, setActiveId] = useState(null);
    const [searchQuery, setSearchQuery] = useState("");

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        }),
    );

    useEffect(() => {
        if (currentUser?.apps) {
            setUserApps(
                [...currentUser.apps].sort((a, b) => a.order - b.order),
            );
        }
    }, [currentUser]);

    useEffect(() => {
        const fetchAvailableApps = async () => {
            try {
                const response = await axios.get("/api/apps");
                const allApps = response.data;

                // Show all apps, not just the ones user doesn't have
                setAvailableApps(allApps);
            } catch (error) {
                console.error("Error fetching available apps:", error);
            }
        };

        fetchAvailableApps();
    }, [userApps]);

    const handleDragStart = (event) => {
        setActiveId(event.active.id);
    };

    const handleDragEnd = async (event) => {
        const { active, over } = event;

        if (active.id !== over?.id) {
            const updatedApps = arrayMove(
                userApps,
                userApps.findIndex((item) => {
                    const itemId =
                        typeof item.appId === "object" && item.appId
                            ? item.appId._id
                            : item.appId;
                    return itemId === active.id;
                }),
                userApps.findIndex((item) => {
                    const itemId =
                        typeof item.appId === "object" && item.appId
                            ? item.appId._id
                            : item.appId;
                    return itemId === over.id;
                }),
            );

            // Update order property for each app
            const appsWithOrder = updatedApps.map((app, index) => ({
                ...app,
                order: index,
            }));

            setUserApps(appsWithOrder);

            // Auto-save the reordered apps
            try {
                await updateUser.mutateAsync({
                    data: { apps: appsWithOrder },
                });
            } catch (error) {
                console.error("Error saving reordered apps:", error);
            }
        }

        // Clear active ID after a small delay to allow animation to complete
        setTimeout(() => {
            setActiveId(null);
        }, 100);
    };

    const handleAddApp = async (appId) => {
        try {
            const newApp = {
                appId: appId,
                order: userApps.length,
                addedAt: new Date(),
            };

            const updatedApps = [...userApps, newApp];
            setUserApps(updatedApps);
            await updateUser.mutateAsync({
                data: { apps: updatedApps },
            });
        } catch (error) {
            console.error("Error adding app:", error);
        }
    };

    const handleRemoveApp = async (appId) => {
        try {
            const updatedApps = userApps.filter((app) => {
                if (typeof app.appId === "object" && app.appId) {
                    return app.appId._id !== appId;
                }
                return app.appId !== appId;
            });

            setUserApps(updatedApps);
            await updateUser.mutateAsync({
                data: { apps: updatedApps },
            });
        } catch (error) {
            console.error("Error removing app:", error);
        }
    };

    // Helper function to check if app is installed
    const isAppInstalled = (appId) => {
        return userApps.some(
            (userApp) =>
                userApp.appId === appId ||
                (typeof userApp.appId === "object" &&
                    userApp.appId &&
                    userApp.appId._id === appId),
        );
    };

    // Filter apps by search query
    const filteredApps = availableApps.filter((app) => {
        if (!searchQuery.trim()) return true;

        const query = searchQuery.toLowerCase();
        const appName = app.name?.toLowerCase() || "";
        const authorName = app.author?.username?.toLowerCase() || "";

        return appName.includes(query) || authorName.includes(query);
    });

    // Filter apps by type
    const nativeApps = filteredApps.filter((app) => app.type === "native");
    const appletApps = filteredApps.filter((app) => app.type === "applet");

    if (isLoading) {
        return (
            <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-600 mx-auto"></div>
                    <p className="mt-2 text-gray-600">{t("Loading...")}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
            <div className="py-8 px-4">
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-600">
                    <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-600">
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                            {t("Manage Apps")}
                        </h1>
                    </div>

                    <div className="p-6">
                        <Tabs defaultValue="available" className="w-full">
                            <TabsList className="grid w-full grid-cols-2">
                                <TabsTrigger value="available">
                                    {t("Available Apps")}
                                </TabsTrigger>
                                <TabsTrigger value="your-apps">
                                    {t("Your Apps")}
                                </TabsTrigger>
                            </TabsList>

                            <TabsContent value="your-apps" className="mt-6">
                                <div className="mb-4">
                                    <p className="text-gray-600 dark:text-gray-400 mb-4">
                                        {t(
                                            "Drag and drop to reorder your apps",
                                        )}
                                    </p>
                                </div>

                                {userApps.length === 0 ? (
                                    <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                                        <p>{t("No apps added yet")}</p>
                                    </div>
                                ) : (
                                    <DndContext
                                        sensors={sensors}
                                        collisionDetection={rectIntersection}
                                        onDragStart={handleDragStart}
                                        onDragEnd={handleDragEnd}
                                    >
                                        <SortableContext
                                            items={userApps.map((app, index) =>
                                                typeof app.appId === "object" &&
                                                app.appId
                                                    ? app.appId._id
                                                    : app.appId ||
                                                      `temp-${index}`,
                                            )}
                                            strategy={
                                                verticalListSortingStrategy
                                            }
                                        >
                                            {userApps.map((app, index) => (
                                                <SortableAppItem
                                                    key={
                                                        typeof app.appId ===
                                                            "object" &&
                                                        app.appId
                                                            ? app.appId._id
                                                            : app.appId ||
                                                              `temp-${index}`
                                                    }
                                                    app={app}
                                                    onRemove={handleRemoveApp}
                                                />
                                            ))}
                                        </SortableContext>
                                        <DragOverlay>
                                            {activeId ? (
                                                <div className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg mb-2 shadow-xl opacity-90 transform rotate-2">
                                                    <div className="flex items-center gap-3">
                                                        <div className="p-1">
                                                            <GripVertical className="h-4 w-4 text-gray-400" />
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <div className="flex items-center justify-center w-8 h-8 bg-gray-100 dark:bg-gray-700 rounded-lg">
                                                                <AppWindow className="w-4 h-4 text-gray-600 dark:text-gray-300" />
                                                            </div>
                                                            <span className="font-medium text-gray-900 dark:text-gray-100">
                                                                {userApps.find(
                                                                    (app) => {
                                                                        const itemId =
                                                                            typeof app.appId ===
                                                                            "object"
                                                                                ? app
                                                                                      .appId
                                                                                      ._id
                                                                                : app.appId;
                                                                        return (
                                                                            itemId ===
                                                                            activeId
                                                                        );
                                                                    },
                                                                )?.appId
                                                                    ?.name ||
                                                                    "Unknown App"}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <div className="p-1">
                                                        <X className="h-4 w-4" />
                                                    </div>
                                                </div>
                                            ) : null}
                                        </DragOverlay>
                                    </DndContext>
                                )}
                            </TabsContent>

                            <TabsContent value="available" className="mt-6">
                                {/* Search Bar */}
                                <div className="mb-6">
                                    <div className="relative">
                                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-gray-500 rtl:left-auto rtl:right-3" />
                                        <input
                                            type="text"
                                            placeholder={t(
                                                "Search apps by name or author...",
                                            )}
                                            value={searchQuery}
                                            onChange={(e) =>
                                                setSearchQuery(e.target.value)
                                            }
                                            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-transparent rtl:pl-4 rtl:pr-10 rtl:text-right bg-white dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100 dark:placeholder-gray-400"
                                        />
                                    </div>
                                </div>

                                {/* Built-in Apps Section */}
                                <div className="mb-6">
                                    <h3 className="text-md font-medium text-gray-800 dark:text-gray-200 mb-3 rtl:text-right">
                                        {t("Built-in Apps")}
                                    </h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                        {nativeApps.map((app) => {
                                            const isInstalled = isAppInstalled(
                                                app._id,
                                            );
                                            const IconComponent = app.icon
                                                ? Icons[app.icon] || AppWindow
                                                : AppWindow;
                                            return (
                                                <div
                                                    key={app._id}
                                                    className="relative p-3 border border-gray-200 rounded-lg bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors cursor-pointer"
                                                    onClick={() => {
                                                        if (
                                                            app.type ===
                                                                "applet" &&
                                                            app.workspaceId
                                                        ) {
                                                            router.push(
                                                                `/published/workspaces/${app.workspaceId}/applet`,
                                                            );
                                                        } else if (app.slug) {
                                                            router.push(
                                                                `/${app.slug}`,
                                                            );
                                                        }
                                                    }}
                                                >
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            isInstalled
                                                                ? handleRemoveApp(
                                                                      app._id,
                                                                  )
                                                                : handleAddApp(
                                                                      app._id,
                                                                  );
                                                        }}
                                                        className={`absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded-full border transition-colors rtl:left-2 rtl:right-auto ${
                                                            isInstalled
                                                                ? "border-red-300 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                                                                : "border-sky-300 text-sky-600 hover:bg-sky-50 dark:hover:bg-sky-900/20"
                                                        }`}
                                                    >
                                                        {isInstalled ? (
                                                            <X className="w-3 h-3" />
                                                        ) : (
                                                            <Plus className="w-3 h-3" />
                                                        )}
                                                    </button>
                                                    <div className="flex items-center gap-2 pe-4 rtl:flex-row-reverse rtl:pe-0 rtl:ps-4">
                                                        <div className="flex items-center justify-center w-10 h-10 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg flex-shrink-0">
                                                            <IconComponent className="w-5 h-5 text-gray-600 dark:text-gray-300" />
                                                        </div>
                                                        <div className="min-w-0 flex-1 rtl:text-right">
                                                            <h3 className="font-medium text-gray-900 dark:text-gray-100 truncate">
                                                                {t(app.name)}
                                                            </h3>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* User-Created Apps Section */}
                                {appletApps.length > 0 && (
                                    <div className="mb-6">
                                        <h3 className="text-md font-medium text-gray-800 dark:text-gray-200 mb-3 rtl:text-right">
                                            {t("User-Created Apps")}
                                        </h3>
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                            {appletApps.map((app) => {
                                                const isInstalled =
                                                    isAppInstalled(app._id);
                                                const IconComponent = app.icon
                                                    ? Icons[app.icon] ||
                                                      AppWindow
                                                    : AppWindow;
                                                const isOwner =
                                                    currentUser?._id ===
                                                    app.author?._id;
                                                return (
                                                    <div
                                                        key={app._id}
                                                        className="relative p-3 border border-gray-200 rounded-lg bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors cursor-pointer"
                                                        onClick={() => {
                                                            if (
                                                                app.type ===
                                                                "applet"
                                                            ) {
                                                                if (app.slug) {
                                                                    // Use new slug-based route
                                                                    router.push(
                                                                        `/apps/${app.slug}`,
                                                                    );
                                                                } else if (
                                                                    app.workspaceId
                                                                ) {
                                                                    // Fallback to old route for backwards compatibility
                                                                    router.push(
                                                                        app.slug
                                                                            ? `/apps/${app.slug}`
                                                                            : `/published/workspaces/${app.workspaceId}/applet`,
                                                                    );
                                                                }
                                                            } else if (
                                                                app.slug
                                                            ) {
                                                                router.push(
                                                                    `/${app.slug}`,
                                                                );
                                                            }
                                                        }}
                                                    >
                                                        <div className="absolute top-2 right-2 flex gap-1 rtl:left-2 rtl:right-auto">
                                                            {isOwner && (
                                                                <button
                                                                    onClick={(
                                                                        e,
                                                                    ) => {
                                                                        e.stopPropagation();
                                                                        router.push(
                                                                            `/workspaces/${app.workspaceId}`,
                                                                        );
                                                                    }}
                                                                    className="w-6 h-6 flex items-center justify-center rounded-full border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                                                                    title={t(
                                                                        "Edit",
                                                                    )}
                                                                >
                                                                    <Edit className="w-3 h-3" />
                                                                </button>
                                                            )}
                                                            <button
                                                                onClick={(
                                                                    e,
                                                                ) => {
                                                                    e.stopPropagation();
                                                                    isInstalled
                                                                        ? handleRemoveApp(
                                                                              app._id,
                                                                          )
                                                                        : handleAddApp(
                                                                              app._id,
                                                                          );
                                                                }}
                                                                className={`w-6 h-6 flex items-center justify-center rounded-full border transition-colors ${
                                                                    isInstalled
                                                                        ? "border-red-300 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                                                                        : "border-sky-300 text-sky-600 hover:bg-sky-50 dark:hover:bg-sky-900/20"
                                                                }`}
                                                            >
                                                                {isInstalled ? (
                                                                    <X className="w-3 h-3" />
                                                                ) : (
                                                                    <Plus className="w-3 h-3" />
                                                                )}
                                                            </button>
                                                        </div>
                                                        <div className="flex items-center gap-2 pe-16 rtl:flex-row-reverse rtl:pe-0 rtl:ps-16">
                                                            <div className="flex items-center justify-center w-10 h-10 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg flex-shrink-0">
                                                                <IconComponent className="w-5 h-5 text-gray-600 dark:text-gray-300" />
                                                            </div>
                                                            <div className="min-w-0 flex-1 rtl:text-right">
                                                                <h3 className="font-medium text-gray-900 dark:text-gray-100 truncate">
                                                                    {t(
                                                                        app.name,
                                                                    )}
                                                                </h3>
                                                            </div>
                                                        </div>
                                                        <div className="mt-2 space-y-1">
                                                            {app.author && (
                                                                <div className="text-xs text-gray-500 dark:text-gray-400 rtl:text-right">
                                                                    {t(
                                                                        "by {{author}}",
                                                                        {
                                                                            author: app
                                                                                .author
                                                                                .username,
                                                                        },
                                                                    )}
                                                                </div>
                                                            )}
                                                            {app.updatedAt && (
                                                                <div className="text-xs text-gray-400 dark:text-gray-500 rtl:text-right truncate">
                                                                    {t(
                                                                        "Updated",
                                                                    )}{" "}
                                                                    {new Date(
                                                                        app.updatedAt,
                                                                    ).toLocaleString()}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </TabsContent>
                        </Tabs>
                    </div>
                </div>
            </div>
        </div>
    );
}
