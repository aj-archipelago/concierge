"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Loader2, Globe, AppWindow } from "lucide-react";
import * as Icons from "lucide-react";
import {
    Tooltip,
    TooltipTrigger,
    TooltipContent,
    TooltipProvider,
} from "@/components/ui/tooltip";
import Loader from "../../components/loader";
import { useCreateWorkspace, useWorkspaces } from "../../queries/workspaces";
import FilterInput from "../../../src/components/common/FilterInput";
import EmptyState from "../../../src/components/common/EmptyState";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";

dayjs.extend(relativeTime);

export default function Workspaces() {
    const router = useRouter();
    const { data: workspaces, isLoading } = useWorkspaces();
    const createWorkspace = useCreateWorkspace();
    const { t } = useTranslation();
    const [filterText, setFilterText] = useState("");
    const [debouncedFilterText, setDebouncedFilterText] = useState("");

    // Debounce filter text
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedFilterText(filterText);
        }, 300);
        return () => clearTimeout(timer);
    }, [filterText]);

    // Filter workspaces
    const filteredWorkspaces = useMemo(() => {
        if (!workspaces) return [];
        if (!debouncedFilterText) return workspaces;

        const query = debouncedFilterText.toLowerCase();
        return workspaces.filter(
            (workspace) =>
                workspace.name?.toLowerCase().includes(query) ||
                workspace.slug?.toLowerCase().includes(query) ||
                workspace.publishedAppletName?.toLowerCase().includes(query) ||
                workspace.publishedPathwayName?.toLowerCase().includes(query),
        );
    }, [workspaces, debouncedFilterText]);

    const handleCreate = async () => {
        const workspace = await createWorkspace.mutateAsync({
            name: t("New Workspace"),
        });
        router.push(`/workspaces/${workspace._id}`);
    };

    if (isLoading) {
        return <Loader />;
    }

    return (
        <div className="pb-4">
            <div className="mb-4">
                {/* Header */}
                <div className="mb-4">
                    <h1 className="text-lg font-semibold">{t("Workspaces")}</h1>
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                        {debouncedFilterText
                            ? `${filteredWorkspaces.length} ${t("matching")} ${t("workspaces")}`
                            : `${workspaces?.length || 0} ${t("workspaces")}`}
                    </div>
                </div>

                {/* Filter and Create Button */}
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
                    {/* Filter Search Control */}
                    <FilterInput
                        value={filterText}
                        onChange={setFilterText}
                        onClear={() => {
                            setFilterText("");
                            setDebouncedFilterText("");
                        }}
                        placeholder={t("Search workspaces...")}
                        className="w-full sm:flex-1 sm:max-w-md"
                    />

                    {/* Create Button */}
                    <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <button
                                        className="lb-primary inline-flex items-center justify-center h-9 w-9 p-0"
                                        onClick={handleCreate}
                                        disabled={createWorkspace.isPending}
                                    >
                                        {createWorkspace.isPending ? (
                                            <Loader2 className="h-5 w-5 animate-spin" />
                                        ) : (
                                            <Plus className="h-5 w-5" />
                                        )}
                                    </button>
                                </TooltipTrigger>
                                <TooltipContent>
                                    {t("New Workspace")}
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    </div>
                </div>
            </div>

            <div className="workspaces">
                {filteredWorkspaces.length > 0 ? (
                    <div className="workspace-grid">
                        {filteredWorkspaces.map((workspace) => (
                            <WorkspaceTile
                                key={workspace._id}
                                workspace={workspace}
                                onClick={() =>
                                    router.push(`/workspaces/${workspace._id}`)
                                }
                            />
                        ))}
                    </div>
                ) : (
                    <EmptyState
                        icon={
                            <svg
                                className="w-16 h-16 mx-auto"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={1}
                                    d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                                />
                            </svg>
                        }
                        title={
                            filterText
                                ? t("No workspaces found")
                                : t("No workspaces yet")
                        }
                        description={
                            filterText
                                ? t(
                                      "Try adjusting your search or clear the filter",
                                  )
                                : t(
                                      "Create your first workspace to get started",
                                  )
                        }
                        action={
                            filterText
                                ? () => {
                                      setFilterText("");
                                      setDebouncedFilterText("");
                                  }
                                : handleCreate
                        }
                        actionLabel={
                            filterText
                                ? t("Clear Filter")
                                : t("Create Workspace")
                        }
                    />
                )}
            </div>
        </div>
    );
}

function WorkspaceTile({ workspace, onClick }) {
    const { t } = useTranslation();

    const promptCount = workspace.prompts?.length || 0;
    const createdAt = workspace.createdAt
        ? dayjs(workspace.createdAt).fromNow()
        : null;
    const updatedAt = workspace.updatedAt
        ? dayjs(workspace.updatedAt).fromNow()
        : null;

    // Get icon component from applet or use default
    const IconComponent = workspace.publishedAppletIcon
        ? Icons[workspace.publishedAppletIcon] || AppWindow
        : AppWindow;

    return (
        <div
            className="workspace-tile cursor-pointer group hover:shadow-lg transition-all duration-200 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
            onClick={onClick}
        >
            {/* Workspace content */}
            <div className="p-4 flex flex-col h-full">
                {/* Title Section with Icon */}
                <div className="flex items-start gap-2.5 mb-2">
                    <IconComponent className="h-8 w-8 flex-shrink-0 text-gray-800 dark:text-gray-200" />
                    <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-base leading-tight text-gray-900 dark:text-gray-100 truncate">
                            {workspace.name || t("Untitled Workspace")}
                        </h3>
                        {workspace.slug && (
                            <div className="text-xs text-gray-500 dark:text-gray-400 truncate font-mono mt-0.5">
                                {workspace.slug}
                            </div>
                        )}
                    </div>
                </div>

                {/* Workspace details - aligned with slug */}
                <div className="flex-1 overflow-hidden">
                    <div className="space-y-1 ms-11">
                        {workspace.hasPublishedApplet && (
                            <div className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400">
                                <Globe className="h-3.5 w-3.5 flex-shrink-0" />
                                <span className="text-xs truncate">
                                    <span className="font-medium">
                                        {t("Applet")}:
                                    </span>{" "}
                                    {workspace.publishedAppletName ||
                                        t("Published Applet")}
                                </span>
                            </div>
                        )}
                        {workspace.hasPublishedPathway && (
                            <div className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400">
                                <Globe className="h-3.5 w-3.5 flex-shrink-0" />
                                <span className="text-xs truncate">
                                    <span className="font-medium">
                                        {t("Pathway")}:
                                    </span>{" "}
                                    {workspace.publishedPathwayName}
                                </span>
                            </div>
                        )}
                        {promptCount > 0 && (
                            <div className="text-xs text-gray-600 dark:text-gray-400">
                                {t("prompts", { count: promptCount })}
                            </div>
                        )}
                        {createdAt && (
                            <div className="text-xs text-gray-600 dark:text-gray-400">
                                {t("Created")} {createdAt}
                            </div>
                        )}
                        {updatedAt && (
                            <div className="text-xs text-gray-600 dark:text-gray-400">
                                {t("Updated")} {updatedAt}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
