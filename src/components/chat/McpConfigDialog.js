"use client";

import React, { useContext, useState } from "react";
import { useTranslation } from "react-i18next";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ExternalLink, Plus, Plug, Trash2 } from "lucide-react";
import classNames from "../../../app/utils/class-names";
import { useMcpServers } from "../../hooks/useMcpServers";
import { MCP_PRESETS } from "../../utils/mcpPresets";
import { LanguageContext } from "../../contexts/LanguageProvider";

export function McpConfigContent({ autoFetch = true } = {}) {
    const { t } = useTranslation();
    const { direction } = useContext(LanguageContext);
    const [showCustomForm, setShowCustomForm] = useState(false);
    const [customForm, setCustomForm] = useState({
        name: "",
        url: "",
        token: "",
    });

    const {
        mcpServers,
        loading,
        error,
        getConnectionStatus,
        handleConnectCustomServer,
        handleAddCustomServer,
        handleRemoveServer,
    } = useMcpServers({ autoFetch });

    const handleAddCustom = async (connectWithOAuth = false) => {
        const result = await handleAddCustomServer({
            ...customForm,
            connectWithOAuth,
        });
        if (result?.serverId) {
            setCustomForm({ name: "", url: "", token: "" });
            setShowCustomForm(false);
        }
    };

    const configuredServerIds = Object.keys(mcpServers);
    const canSubmitCustomServer = Boolean(
        customForm.name.trim() && customForm.url.trim(),
    );

    return (
        <>
            {error && (
                <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
                    {error}
                </div>
            )}

            {loading ? (
                <div className="py-8 text-center text-gray-500 dark:text-gray-400">
                    {t("Loading...")}
                </div>
            ) : (
                <div className="space-y-5" dir={direction}>
                    <div>
                        <div className="mb-2 flex items-center justify-between gap-3">
                            <div>
                                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                    {t("Custom MCP servers")}
                                </h4>
                                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                    {t("mcp_custom_servers_description")}
                                </p>
                            </div>
                            {!showCustomForm && (
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setShowCustomForm(true)}
                                >
                                    <Plus className="me-1 h-4 w-4" />
                                    {t("Add server")}
                                </Button>
                            )}
                        </div>

                        {showCustomForm && (
                            <div
                                className={classNames(
                                    "space-y-2 rounded-lg border p-3",
                                    "border-gray-200 bg-white dark:border-gray-600 dark:bg-gray-800",
                                )}
                            >
                                <input
                                    type="text"
                                    placeholder={t("Name (e.g. My Server)")}
                                    value={customForm.name}
                                    onChange={(event) =>
                                        setCustomForm((prev) => ({
                                            ...prev,
                                            name: event.target.value,
                                        }))
                                    }
                                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                                />
                                <input
                                    type="url"
                                    placeholder={t("mcp_url_placeholder")}
                                    value={customForm.url}
                                    onChange={(event) =>
                                        setCustomForm((prev) => ({
                                            ...prev,
                                            url: event.target.value,
                                        }))
                                    }
                                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                                />
                                <input
                                    type="password"
                                    placeholder={t("Bearer token (optional)")}
                                    value={customForm.token}
                                    onChange={(event) =>
                                        setCustomForm((prev) => ({
                                            ...prev,
                                            token: event.target.value,
                                        }))
                                    }
                                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                                />
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                    {t("mcp_custom_oauth_hint")}
                                </p>
                                <div className="flex flex-wrap justify-end gap-2">
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => {
                                            setShowCustomForm(false);
                                            setCustomForm({
                                                name: "",
                                                url: "",
                                                token: "",
                                            });
                                        }}
                                    >
                                        {t("Cancel")}
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => handleAddCustom(true)}
                                        disabled={!canSubmitCustomServer}
                                    >
                                        <ExternalLink className="me-1 h-4 w-4" />
                                        {t("Add & connect OAuth")}
                                    </Button>
                                    <Button
                                        size="sm"
                                        onClick={() => handleAddCustom(false)}
                                        disabled={!canSubmitCustomServer}
                                    >
                                        {t("Add")}
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>

                    <div>
                        <h4 className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                            {t("Your connectors")}
                        </h4>
                        {configuredServerIds.length === 0 ? (
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                {t("No connectors added yet.")}
                            </p>
                        ) : (
                            <ul className="space-y-2">
                                {configuredServerIds.map((serverId) => {
                                    const config = mcpServers[serverId];
                                    const preset = MCP_PRESETS[serverId];
                                    const displayName =
                                        preset?.name ||
                                        config?.name ||
                                        serverId.replace(/^custom-/, "");
                                    const status = getConnectionStatus(config);
                                    const statusLabel =
                                        status === "connected"
                                            ? config?.authType === "oauth2"
                                                ? t("OAuth connected")
                                                : t("Token available")
                                            : status === "expired"
                                              ? t("Token expired")
                                              : preset
                                                ? t("Not authenticated")
                                                : t("No token");
                                    const oauthActionLabel =
                                        status === "connected"
                                            ? t("Reconnect OAuth")
                                            : t("Connect OAuth");
                                    const isCustom =
                                        serverId.startsWith("custom-");

                                    return (
                                        <li
                                            key={serverId}
                                            className={classNames(
                                                "flex items-center justify-between gap-3 rounded-lg border p-2",
                                                "border-gray-200 bg-gray-50 dark:border-gray-600 dark:bg-gray-800/50",
                                            )}
                                        >
                                            <div className="min-w-0 flex-1">
                                                <span className="block truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                                                    {displayName}
                                                </span>
                                                {config?.url && (
                                                    <span className="block truncate text-xs text-gray-500 dark:text-gray-400">
                                                        {config.url}
                                                    </span>
                                                )}
                                                <span className="text-xs text-gray-500 dark:text-gray-400">
                                                    {statusLabel}
                                                </span>
                                            </div>
                                            <div className="flex flex-shrink-0 flex-wrap items-center justify-end gap-1">
                                                {isCustom && (
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        onClick={() =>
                                                            handleConnectCustomServer(
                                                                serverId,
                                                            )
                                                        }
                                                    >
                                                        <ExternalLink className="me-1 h-4 w-4" />
                                                        {oauthActionLabel}
                                                    </Button>
                                                )}
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    aria-label={t(
                                                        "Remove {{name}}",
                                                        { name: displayName },
                                                    )}
                                                    className="text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-900/20"
                                                    onClick={() =>
                                                        handleRemoveServer(
                                                            serverId,
                                                        )
                                                    }
                                                >
                                                    <Trash2
                                                        className="h-4 w-4"
                                                        aria-hidden="true"
                                                    />
                                                </Button>
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>
                </div>
            )}
        </>
    );
}

export default function McpConfigDialog({ open, onOpenChange }) {
    const { t } = useTranslation();
    const { direction } = useContext(LanguageContext);
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                dir={direction}
                className="w-[calc(100vw-1rem)] sm:max-w-lg"
            >
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Plug className="h-5 w-5" />
                        {t("Connectors")}
                    </DialogTitle>
                    <DialogDescription>
                        {t("mcp_dialog_description")}
                    </DialogDescription>
                </DialogHeader>
                {open && <McpConfigContent />}
            </DialogContent>
        </Dialog>
    );
}
