"use client";

import {
    useCallback,
    useContext,
    useEffect,
    useId,
    useMemo,
    useRef,
    useState,
} from "react";
import { useTranslation } from "react-i18next";
import { usePathname } from "next/navigation";
import { useSelector } from "react-redux";
import {
    CLIENT_SIDE_TOOLS,
    filterToolsByRoute,
} from "../../utils/clientSideTools";
import { getToolUiDescription, getToolUiName } from "../../utils/toolUiDisplay";
import { usePageContext } from "../../contexts/PageContextProvider";
import { Wrench, AlertTriangle, Plug, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMcpServers } from "../../hooks/useMcpServers";
import { LanguageContext } from "../../contexts/LanguageProvider";

const POPOVER_MARGIN = 8;
const POPOVER_MAX_WIDTH = 320;
const POPOVER_MAX_HEIGHT = 384;
const POPOVER_MIN_HEIGHT = 96;

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

export function getActiveToolsPopoverStyle(
    triggerRect,
    { viewportWidth, viewportHeight, alignStart = false } = {},
) {
    if (!triggerRect || !viewportWidth || !viewportHeight) return null;

    const width = Math.min(
        POPOVER_MAX_WIDTH,
        Math.max(0, viewportWidth - POPOVER_MARGIN * 2),
    );
    const maxLeft = Math.max(
        POPOVER_MARGIN,
        viewportWidth - width - POPOVER_MARGIN,
    );
    const desiredLeft = alignStart
        ? triggerRect.left
        : triggerRect.right - width;
    const left = clamp(desiredLeft, POPOVER_MARGIN, maxLeft);

    const belowTop = triggerRect.bottom + POPOVER_MARGIN;
    const belowHeight = Math.max(0, viewportHeight - belowTop - POPOVER_MARGIN);
    const aboveHeight = Math.max(0, triggerRect.top - POPOVER_MARGIN * 2);
    const openAbove =
        belowHeight < POPOVER_MIN_HEIGHT && aboveHeight > belowHeight;
    const availableHeight = openAbove ? aboveHeight : belowHeight;
    const maxHeight = Math.min(
        POPOVER_MAX_HEIGHT,
        Math.max(POPOVER_MIN_HEIGHT, availableHeight),
    );
    const desiredTop = openAbove
        ? triggerRect.top - POPOVER_MARGIN - maxHeight
        : belowTop;
    const maxTop = Math.max(
        POPOVER_MARGIN,
        viewportHeight - maxHeight - POPOVER_MARGIN,
    );
    const top = clamp(desiredTop, POPOVER_MARGIN, maxTop);

    return { left, top, width, maxHeight };
}

function ActiveToolsList({ displayState = "full" }) {
    const { t } = useTranslation();
    const { direction } = useContext(LanguageContext);
    const popoverId = useId();
    const containerRef = useRef(null);
    const [isOpen, setIsOpen] = useState(false);
    const [popoverStyle, setPopoverStyle] = useState(null);
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
    const isDocked = displayState === "docked";
    const isRTL = direction === "rtl";
    const alignPopoverStart = isDocked || isRTL;

    const updatePopoverPosition = useCallback(() => {
        if (typeof window === "undefined") return;

        const trigger = containerRef.current?.querySelector("button");
        if (!trigger) return;

        setPopoverStyle(
            getActiveToolsPopoverStyle(trigger.getBoundingClientRect(), {
                viewportWidth: window.innerWidth,
                viewportHeight: window.innerHeight,
                alignStart: alignPopoverStart,
            }),
        );
    }, [alignPopoverStart]);

    useEffect(() => {
        if (!isOpen) return;

        const handlePointerDown = (event) => {
            if (!containerRef.current?.contains(event.target)) {
                setIsOpen(false);
            }
        };
        const handleKeyDown = (event) => {
            if (event.key === "Escape") {
                setIsOpen(false);
            }
        };

        document.addEventListener("pointerdown", handlePointerDown);
        document.addEventListener("keydown", handleKeyDown);
        window.addEventListener("resize", updatePopoverPosition);
        window.addEventListener("scroll", updatePopoverPosition, true);
        updatePopoverPosition();

        return () => {
            document.removeEventListener("pointerdown", handlePointerDown);
            document.removeEventListener("keydown", handleKeyDown);
            window.removeEventListener("resize", updatePopoverPosition);
            window.removeEventListener("scroll", updatePopoverPosition, true);
        };
    }, [isOpen, updatePopoverPosition]);

    useEffect(() => {
        if (totalToolsCount === 0 && !hasConnectors) {
            setIsOpen(false);
            setPopoverStyle(null);
        }
    }, [hasConnectors, totalToolsCount]);

    // Don't show if no tools and no connectors available
    if (totalToolsCount === 0 && !hasConnectors) {
        return null;
    }

    return (
        <div
            ref={containerRef}
            className="relative inline-flex"
            dir={direction}
        >
            <button
                type="button"
                className={`flex items-center gap-1 rounded-md transition-colors border bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600 ${
                    isDocked ? "px-1.5 py-1 text-xs" : "px-2 py-1.5 text-sm"
                }`}
                title={t("View available tools")}
                aria-haspopup="dialog"
                aria-expanded={isOpen}
                aria-controls={isOpen ? popoverId : undefined}
                onClick={() => {
                    if (!isOpen) {
                        updatePopoverPosition();
                    }
                    setIsOpen((open) => !open);
                }}
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
            {isOpen && (
                <div
                    id={popoverId}
                    role="dialog"
                    aria-label={t("Available Tools")}
                    className={cn(
                        "fixed z-[1000] overflow-y-auto overscroll-contain rounded-md border border-gray-200 bg-white p-4 text-gray-950 shadow-md outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100",
                        isDocked ? "text-xs" : "text-sm",
                    )}
                    style={popoverStyle || undefined}
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
                                    const displayDescription =
                                        getToolUiDescription(tool, t);
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
                                    const displayDescription =
                                        getToolUiDescription(tool, t);
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
                                                            disabled={
                                                                mcpLoading
                                                            }
                                                            className="inline-flex items-center gap-1 rounded-full border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/30 px-1.5 py-0 text-xs font-semibold text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/50 transition-colors cursor-pointer"
                                                            title={t(
                                                                "Token expired - click to reconnect",
                                                            )}
                                                        >
                                                            <AlertTriangle className="w-3 h-3" />
                                                            {t("Reconnect")}
                                                        </button>
                                                    )}
                                                    {!isConnected &&
                                                        !isExpired && (
                                                            <span className="inline-flex items-center rounded-full border border-gray-200 dark:border-gray-600 px-1.5 py-0 text-xs font-semibold text-gray-500 dark:text-gray-400">
                                                                {t(
                                                                    "Disconnected",
                                                                )}
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
                </div>
            )}
        </div>
    );
}

export default ActiveToolsList;
