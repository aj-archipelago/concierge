"use client";

import { useTranslation } from "react-i18next";
import {
    CheckSquare,
    X,
    Download,
    Trash2,
    Tag,
    Loader2,
    Paperclip,
    FolderInput,
} from "lucide-react";

/**
 * Reusable bulk actions bar component for media pages and chat history
 * @param {Object} props
 * @param {number} props.selectedCount - Number of selected items
 * @param {boolean} props.allSelected - Whether all visible items are selected
 * @param {Function} props.onSelectAll - Callback for select all/deselect all
 * @param {Function} props.onClearSelection - Callback to clear selection
 * @param {Object} props.actions - Actions to show in the bar
 * @param {number|null} props.bottomActionsLeft - Left position for the bar
 * @param {"viewport"|"container"} props.positionMode - Position relative to viewport or nearest positioned container
 * @param {boolean} props.isLoadingAll - Whether all items are being loaded
 */
export default function BulkActionsBar({
    selectedCount,
    allSelected,
    onSelectAll,
    onClearSelection,
    actions = {},
    bottomActionsLeft = null,
    positionMode = "viewport",
    isLoadingAll = false,
}) {
    const { t } = useTranslation();

    if (selectedCount === 0) {
        return null;
    }

    return (
        <div
            className="pointer-events-none"
            role="region"
            aria-label={t("Bulk actions")}
            style={{
                position: positionMode === "container" ? "absolute" : "fixed",
                bottom: "3rem",
                left:
                    positionMode === "viewport" && bottomActionsLeft !== null
                        ? `${bottomActionsLeft}px`
                        : "50%",
                transform: "translateX(-50%)",
                zIndex: 40,
            }}
        >
            <div className="pointer-events-auto flex max-w-[calc(100vw-1rem)] items-center gap-2 overflow-x-auto rounded-lg border border-gray-400 bg-white px-3 py-2 text-gray-900 shadow-[0_18px_45px_rgba(15,23,42,0.28)] ring-1 ring-gray-950/10 dark:border-gray-500 dark:bg-gray-900 dark:text-gray-100 dark:shadow-[0_18px_45px_rgba(0,0,0,0.6)] dark:ring-white/15">
                <span className="text-sm whitespace-nowrap">
                    {t("Selected")} {selectedCount}
                </span>

                {/* Select All / Deselect All */}
                {onSelectAll && (
                    <button
                        onClick={onSelectAll}
                        disabled={isLoadingAll}
                        className="lb-outline flex items-center gap-2 whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-50"
                        aria-label={
                            allSelected ? t("Deselect All") : t("Select All")
                        }
                    >
                        {isLoadingAll ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <CheckSquare className="h-4 w-4" />
                        )}
                        <span className="hidden sm:inline">
                            {isLoadingAll
                                ? t("Loading...")
                                : allSelected
                                  ? t("Deselect All")
                                  : t("Select All")}
                        </span>
                    </button>
                )}

                {/* Attach Action */}
                {actions.attach && (
                    <button
                        onClick={actions.attach.onClick}
                        disabled={
                            selectedCount === 0 || actions.attach.disabled
                        }
                        className="lb-primary flex items-center gap-2 whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-50"
                        aria-label={actions.attach.ariaLabel}
                    >
                        <Paperclip className="h-4 w-4" />
                        <span className="hidden sm:inline">
                            {actions.attach.label}
                        </span>
                    </button>
                )}

                {/* Download/Export Action */}
                {actions.download && (
                    <button
                        onClick={actions.download.onClick}
                        disabled={
                            selectedCount === 0 || actions.download.disabled
                        }
                        className="lb-secondary flex items-center gap-2 whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-50"
                        aria-label={actions.download.ariaLabel}
                    >
                        {actions.download.disabled ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <Download className="h-4 w-4" />
                        )}
                        <span className="hidden sm:inline">
                            {actions.download.disabled
                                ? actions.download.loadingLabel ||
                                  t("Creating ZIP...")
                                : actions.download.label}
                        </span>
                    </button>
                )}

                {/* Move Action */}
                {actions.move && (
                    <button
                        onClick={actions.move.onClick}
                        disabled={selectedCount === 0 || actions.move.disabled}
                        className="lb-outline flex items-center gap-2 whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-50"
                        aria-label={actions.move.ariaLabel}
                    >
                        {actions.move.disabled ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <FolderInput className="h-4 w-4" />
                        )}
                        <span className="hidden sm:inline">
                            {actions.move.disabled
                                ? actions.move.loadingLabel || t("Moving...")
                                : actions.move.label}
                        </span>
                    </button>
                )}

                {/* Tag Action */}
                {actions.tag && (
                    <button
                        onClick={actions.tag.onClick}
                        disabled={selectedCount === 0}
                        className="lb-outline flex items-center gap-2 whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-50"
                        aria-label={actions.tag.ariaLabel}
                    >
                        <Tag className="h-4 w-4" />
                        <span className="hidden sm:inline">
                            {actions.tag.label}
                        </span>
                    </button>
                )}

                {/* Delete Action */}
                {actions.delete && (
                    <button
                        onClick={actions.delete.onClick}
                        disabled={selectedCount === 0}
                        className="lb-danger flex items-center gap-2 whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-50"
                        aria-label={actions.delete.ariaLabel}
                    >
                        <Trash2 className="h-4 w-4" />
                        <span className="hidden sm:inline">
                            {actions.delete.label}
                        </span>
                    </button>
                )}

                {/* Custom actions */}
                {actions.custom &&
                    actions.custom.map((action, index) => {
                        const Icon = action.icon;
                        return (
                            <button
                                key={index}
                                onClick={action.onClick}
                                disabled={action.disabled}
                                className={`${action.className || "lb-outline"} flex items-center gap-2 whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-50`}
                                aria-label={action.ariaLabel}
                            >
                                {Icon && <Icon className="h-4 w-4" />}
                                <span className="hidden sm:inline">
                                    {action.label}
                                </span>
                            </button>
                        );
                    })}

                {/* Cancel/Clear Selection */}
                {onClearSelection && (
                    <button
                        onClick={onClearSelection}
                        className="lb-outline flex items-center gap-2 whitespace-nowrap"
                        aria-label={t("Cancel")}
                    >
                        <X className="h-4 w-4" />
                        <span className="hidden sm:inline">{t("Cancel")}</span>
                    </button>
                )}
            </div>
        </div>
    );
}
