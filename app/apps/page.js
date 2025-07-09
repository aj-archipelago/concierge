"use client";

import { cn } from "@/lib/utils";
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
import { AppWindow, GripVertical, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useCurrentUser, useUpdateCurrentUser } from "../queries/users";
import axios from "../utils/axios-client";

function SortableAppItem({ app, onRemove, isCollapsed }) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({
        id: typeof app.appId === "object" ? app.appId._id : app.appId,
    });

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
                "flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg mb-2",
                isDragging && "opacity-50 shadow-lg",
            )}
        >
            <div className="flex items-center gap-3">
                <button
                    {...attributes}
                    {...listeners}
                    className="cursor-grab active:cursor-grabbing p-1 hover:bg-gray-100 rounded"
                >
                    <GripVertical className="h-4 w-4 text-gray-400" />
                </button>
                <div className="flex items-center gap-2">
                    <div className="flex items-center justify-center w-8 h-8 bg-gray-100 rounded-lg">
                        <IconComponent className="w-4 h-4 text-gray-600" />
                    </div>
                    <span className="font-medium text-gray-900">{appName}</span>
                </div>
            </div>
            <button
                onClick={() =>
                    onRemove(
                        typeof app.appId === "object"
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
    const { data: currentUser, isLoading } = useCurrentUser();
    const updateUser = useUpdateCurrentUser();
    const [userApps, setUserApps] = useState([]);
    const [availableApps, setAvailableApps] = useState([]);
    const [activeId, setActiveId] = useState(null);

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
                        typeof item.appId === "object"
                            ? item.appId._id
                            : item.appId;
                    return itemId === active.id;
                }),
                userApps.findIndex((item) => {
                    const itemId =
                        typeof item.appId === "object"
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
                if (typeof app.appId === "object") {
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
                    userApp.appId._id === appId),
        );
    };

    // Filter apps by type
    const nativeApps = availableApps.filter((app) => app.type === "native");
    const appletApps = availableApps.filter((app) => app.type === "applet");

    if (isLoading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-600 mx-auto"></div>
                    <p className="mt-2 text-gray-600">{t("Loading...")}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="py-8 px-4">
                <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                    <div className="px-6 py-4 border-b border-gray-200">
                        <h1 className="text-2xl font-bold text-gray-900">
                            {t("Manage Apps")}
                        </h1>
                        <p className="text-gray-600 mt-1">
                            {t("Drag and drop to reorder your apps")}
                        </p>
                    </div>

                    <div className="p-6">
                        <div className="mb-6">
                            <h2 className="text-lg font-semibold text-gray-900 mb-4">
                                {t("Your Apps")}
                            </h2>

                            {userApps.length === 0 ? (
                                <div className="text-center py-8 text-gray-500">
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
                                        items={userApps.map((app) =>
                                            typeof app.appId === "object"
                                                ? app.appId._id
                                                : app.appId,
                                        )}
                                        strategy={verticalListSortingStrategy}
                                    >
                                        {userApps.map((app) => (
                                            <SortableAppItem
                                                key={
                                                    typeof app.appId ===
                                                    "object"
                                                        ? app.appId._id
                                                        : app.appId
                                                }
                                                app={app}
                                                onRemove={handleRemoveApp}
                                            />
                                        ))}
                                    </SortableContext>
                                    <DragOverlay>
                                        {activeId ? (
                                            <div className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg mb-2 shadow-xl opacity-90 transform rotate-2">
                                                <div className="flex items-center gap-3">
                                                    <div className="p-1">
                                                        <GripVertical className="h-4 w-4 text-gray-400" />
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <div className="flex items-center justify-center w-8 h-8 bg-gray-100 rounded-lg">
                                                            <AppWindow className="w-4 h-4 text-gray-600" />
                                                        </div>
                                                        <span className="font-medium text-gray-900">
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
                                                            )?.appId?.name ||
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
                        </div>

                        <div className="mb-6">
                            <h2 className="text-lg font-semibold text-gray-900 mb-4">
                                {t("Available Apps")}
                            </h2>

                            {/* Built-in Apps Section */}
                            <div className="mb-6">
                                <h3 className="text-md font-medium text-gray-800 mb-3">
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
                                                className="p-4 border border-gray-200 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors"
                                            >
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-3">
                                                        <div className="flex items-center justify-center w-10 h-10 bg-white border border-gray-200 rounded-lg">
                                                            <IconComponent className="w-5 h-5 text-gray-600" />
                                                        </div>
                                                        <div>
                                                            <h3 className="font-medium text-gray-900">
                                                                {app.name}
                                                            </h3>
                                                        </div>
                                                    </div>
                                                    <button
                                                        onClick={() =>
                                                            isInstalled
                                                                ? handleRemoveApp(
                                                                      app._id,
                                                                  )
                                                                : handleAddApp(
                                                                      app._id,
                                                                  )
                                                        }
                                                        className={`px-2 py-1 text-xs rounded-full border transition-colors ${
                                                            isInstalled
                                                                ? "border-red-300 text-red-600 hover:bg-red-50"
                                                                : "border-sky-300 text-sky-600 hover:bg-sky-50"
                                                        }`}
                                                    >
                                                        {isInstalled
                                                            ? "Remove"
                                                            : "Add"}
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* User-Created Apps Section */}
                            <div className="mb-6">
                                <h3 className="text-md font-medium text-gray-800 mb-3">
                                    {t("User-Created Apps")}
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {appletApps.map((app) => {
                                        const isInstalled = isAppInstalled(
                                            app._id,
                                        );
                                        const IconComponent = app.icon
                                            ? Icons[app.icon] || AppWindow
                                            : AppWindow;
                                        return (
                                            <div
                                                key={app._id}
                                                className="p-4 border border-gray-200 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors"
                                            >
                                                <div className="flex items-start justify-between gap-2">
                                                    <div className="flex items-start gap-3 flex-1">
                                                        <div className="flex items-center justify-center w-10 h-10 bg-white border border-gray-200 rounded-lg flex-shrink-0">
                                                            <IconComponent className="w-5 h-5 text-gray-600" />
                                                        </div>
                                                        <div className="flex-1">
                                                            <h3 className="font-medium text-gray-900">
                                                                {app.name}
                                                            </h3>
                                                            {app.author && (
                                                                <p className="text-sm text-gray-500 mt-1">
                                                                    by{" "}
                                                                    {
                                                                        app
                                                                            .author
                                                                            .username
                                                                    }
                                                                </p>
                                                            )}
                                                            {app.updatedAt && (
                                                                <p className="text-xs text-gray-400 mt-1">
                                                                    Updated{" "}
                                                                    {new Date(
                                                                        app.updatedAt,
                                                                    ).toLocaleString()}
                                                                </p>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <button
                                                        onClick={() =>
                                                            isInstalled
                                                                ? handleRemoveApp(
                                                                      app._id,
                                                                  )
                                                                : handleAddApp(
                                                                      app._id,
                                                                  )
                                                        }
                                                        className={`px-2 py-1 text-xs rounded-full border transition-colors ${
                                                            isInstalled
                                                                ? "border-red-300 text-red-600 hover:bg-red-50"
                                                                : "border-sky-300 text-sky-600 hover:bg-sky-50"
                                                        }`}
                                                    >
                                                        {isInstalled
                                                            ? "Remove"
                                                            : "Add"}
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
