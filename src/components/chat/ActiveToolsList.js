"use client";

import { useContext, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { usePathname } from "next/navigation";
import { useSelector } from "react-redux";
import {
    CLIENT_SIDE_TOOLS,
    filterToolsByRoute,
} from "../../utils/clientSideTools";
import { getToolUiDescription, getToolUiName } from "../../utils/toolUiDisplay";
import { usePageContext } from "../../contexts/PageContextProvider";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { Wrench, AlertTriangle, Plug, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMcpServers } from "../../hooks/useMcpServers";
import { LanguageContext } from "../../contexts/LanguageProvider";

function ActiveToolsList({ displayState = "full" }) {
    const { t } = useTranslation();
    const { direction } = useContext(LanguageContext);
    const pathname = usePathname();
    const { contextualTools } = usePageContext();
    const canvasContent = useSelector((state) => state.chat?.canvasContent);

    const {
        configuredConnections,
        handleConnectPreset,
        loading: mcpLoading,
    } = useMcpServers();

    // Filter client-side tools based on current route and canvas state, and separate from contextual tools
    const { globalTools, pageSpecificTools } = useMemo(() => {
        const filteredClientSideTools = filterToolsByRoute(
            pathname,
            CLIENT_SIDE_TOOLS,
            canvasContent,
        );
        return {
            globalTools: filteredClientSideTools,
            pageSpecificTools: contextualTools || [],
        };
    }, [pathname, contextualTools, canvasContent]);

    const totalToolsCount = globalTools.length + pageSpecificTools.length;
    const hasConnectors = configuredConnections.length > 0;
    const expiredCount = configuredConnections.filter(
        (c) => c.status === "expired",
    ).length;

    // Don't show if no tools and no connectors available
    if (totalToolsCount === 0 && !hasConnectors) {
        return null;
    }

    const isDocked = displayState === "docked";
    const isRTL = direction === "rtl";
    // LTR: align end = popover extends left from a trailing-side trigger. RTL: align start so the
    // popover extends left from the trigger (avoids opening off to the "wrong" side).
    const popoverAlign = isRTL ? "start" : "end";

    return (
        <Popover>
            <PopoverTrigger asChild>
                <button
                    className={`flex items-center gap-1 rounded-md transition-colors border bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600 ${
                        isDocked ? "px-1.5 py-1 text-xs" : "px-2 py-1.5 text-sm"
                    }`}
                    title={t("View available tools")}
                >
                    <Wrench className={isDocked ? "w-3 h-3" : "w-4 h-4"} />
                    {!isDocked && (
                        <span className="hidden text-xs sm:inline">
                            {totalToolsCount}
                        </span>
                    )}
                    {isDocked && (
                        <span className="text-xs font-medium">
                            {totalToolsCount}
                        </span>
                    )}
                    {expiredCount > 0 && (
                        <span className="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0" />
                    )}
                </button>
            </PopoverTrigger>
            <PopoverContent
                className={`w-80 max-h-96 overflow-y-auto ${
                    isDocked ? "text-xs" : "text-sm"
                }`}
                side="bottom"
                align={popoverAlign}
            >
                <div className="space-y-4">
                    <div className="font-semibold text-sm border-b pb-2">
                        {t("Available Tools")} ({totalToolsCount})
                    </div>

                    {/* Global Tools Section */}
                    {globalTools.length > 0 && (
                        <div className="space-y-2">
                            <div className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                                {t("Global Tools")}
                            </div>
                            {globalTools.map((tool, index) => {
                                const displayName = getToolUiName(tool, t);
                                const displayDescription = getToolUiDescription(
                                    tool,
                                    t,
                                );
                                const toolIcon = tool.icon || "🔧";

                                return (
                                    <div
                                        key={`global-${index}`}
                                        className="p-2 rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800"
                                    >
                                        <div
                                            className={cn(
                                                "flex items-start gap-2",
                                                isRTL && "flex-row-reverse",
                                            )}
                                        >
                                            <span className="text-base flex-shrink-0">
                                                {toolIcon}
                                            </span>
                                            <div className="flex-1 min-w-0 text-start">
                                                <div className="font-medium text-gray-900 dark:text-gray-100">
                                                    {displayName}
                                                </div>
                                                {displayDescription && (
                                                    <div className="text-xs text-gray-600 dark:text-gray-400 mt-1 line-clamp-2 text-start">
                                                        {displayDescription}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* Page-specific Tools Section */}
                    {pageSpecificTools.length > 0 && (
                        <div className="space-y-2">
                            <div className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                                {t("Page-specific Tools")}
                            </div>
                            {pageSpecificTools.map((tool, index) => {
                                const displayName = getToolUiName(tool, t);
                                const displayDescription = getToolUiDescription(
                                    tool,
                                    t,
                                );
                                const toolIcon = tool.icon || "🔧";

                                return (
                                    <div
                                        key={`page-${index}`}
                                        className="p-2 rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800"
                                    >
                                        <div
                                            className={cn(
                                                "flex items-start gap-2",
                                                isRTL && "flex-row-reverse",
                                            )}
                                        >
                                            <span className="text-base flex-shrink-0">
                                                {toolIcon}
                                            </span>
                                            <div className="flex-1 min-w-0 text-start">
                                                <div className="font-medium text-gray-900 dark:text-gray-100">
                                                    {displayName}
                                                </div>
                                                {displayDescription && (
                                                    <div className="text-xs text-gray-600 dark:text-gray-400 mt-1 line-clamp-2 text-start">
                                                        {displayDescription}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* Connectors Section */}
                    {hasConnectors && (
                        <div className="space-y-2">
                            <div className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide flex items-center gap-1.5">
                                <Plug className="w-3 h-3" />
                                {t("help_category_connectors")}
                            </div>
                            {configuredConnections.map((connection) => {
                                const { serverId, displayName, status } =
                                    connection;
                                const isExpired = status === "expired";
                                const isConnected = status === "connected";

                                return (
                                    <div
                                        key={`connector-${serverId}`}
                                        className="p-2 rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800"
                                    >
                                        <div className="flex items-center justify-between gap-2">
                                            <div className="flex items-center gap-2 min-w-0">
                                                <Plug className="w-4 h-4 flex-shrink-0 text-gray-500 dark:text-gray-400" />
                                                <span className="font-medium text-gray-900 dark:text-gray-100 truncate">
                                                    {displayName}
                                                </span>
                                            </div>
                                            <div className="flex-shrink-0">
                                                {isConnected && (
                                                    <span className="inline-flex items-center gap-1 rounded-full border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/30 px-1.5 py-0 text-xs font-semibold text-green-700 dark:text-green-400">
                                                        <CheckCircle className="w-3 h-3" />
                                                        {t("Connected")}
                                                    </span>
                                                )}
                                                {isExpired && (
                                                    <button
                                                        onClick={() =>
                                                            handleConnectPreset(
                                                                serverId,
                                                            )
                                                        }
                                                        disabled={mcpLoading}
                                                        className="inline-flex items-center gap-1 rounded-full border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/30 px-1.5 py-0 text-xs font-semibold text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/50 transition-colors cursor-pointer"
                                                        title={t(
                                                            "Token expired - click to reconnect",
                                                        )}
                                                    >
                                                        <AlertTriangle className="w-3 h-3" />
                                                        {t("Reconnect")}
                                                    </button>
                                                )}
                                                {!isConnected && !isExpired && (
                                                    <span className="inline-flex items-center rounded-full border border-gray-200 dark:border-gray-600 px-1.5 py-0 text-xs font-semibold text-gray-500 dark:text-gray-400">
                                                        {t("Disconnected")}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </PopoverContent>
        </Popover>
    );
}

export default ActiveToolsList;
