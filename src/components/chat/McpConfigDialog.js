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
import { MCP_PRESETS, FEATURED_PRESET_IDS } from "../../utils/mcpPresets";
import { Plug, Trash2, ExternalLink, Plus } from "lucide-react";
import classNames from "../../../app/utils/class-names";
import { useMcpServers } from "../../hooks/useMcpServers";
import { getConnectorIcon } from "../icons/ConnectorIcons";
import { LanguageContext } from "../../contexts/LanguageProvider";
import LocalComputers from "./LocalComputers";
import { usesCompanion } from "../../utils/mcpConnectionRoute";

export function McpConfigContent({ autoFetch = true } = {}) {
    const { t } = useTranslation();
    const { direction } = useContext(LanguageContext);
    const [tokenInput, setTokenInput] = useState({});
    const [showTokenInput, setShowTokenInput] = useState({});
    const [showCustomForm, setShowCustomForm] = useState(false);
    const [companionIntent, setCompanionIntent] = useState(null);
    const [throughComputer, setThroughComputer] = useState(false);
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
        handleConnectPreset: connectPreset,
        handleConnectCustomServer,
        handleSaveToken: saveToken,
        handleAddCustomServer,
        handleRemoveServer,
    } = useMcpServers({ autoFetch });

    const handleConnectPreset = async (presetId) => {
        const result = await connectPreset(presetId);
        if (result?.action === "show-token-input") {
            setShowTokenInput((prev) => ({ ...prev, [presetId]: true }));
        }
    };

    const handleSaveToken = async (presetId) => {
        const token = tokenInput[presetId]?.trim();
        if (!token) return;
        await saveToken(presetId, token);
        setShowTokenInput((prev) => ({ ...prev, [presetId]: false }));
        setTokenInput((prev) => ({ ...prev, [presetId]: "" }));
    };

    const handleAddCustom = async (connectWithOAuth = false) => {
        if (throughComputer || usesCompanion(customForm.url)) {
            setCompanionIntent({ kind: "server", ...customForm });
            setCustomForm({ name: "", url: "", token: "" });
            setShowCustomForm(false);
            setThroughComputer(false);
            return;
        }
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
        <div
            dir={direction}
            className="space-y-4 text-gray-900 dark:text-gray-100 [&_button]:min-h-10"
        >
            <LocalComputers
                intent={companionIntent}
                onIntentHandled={() => setCompanionIntent(null)}
            />
            {error && (
                <div className="rounded-md bg-red-50 dark:bg-red-900/20 px-3 py-2 text-sm text-red-700 dark:text-red-400">
                    {error}
                </div>
            )}

            {loading ? (
                <div className="py-8 text-center text-gray-500 dark:text-gray-400">
                    {t("Loading...")}
                </div>
            ) : (
                <div className="space-y-4" dir={direction}>
                    <div>
                        <h4 className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                            {t("Quick connect")}
                        </h4>
                        <div className="space-y-2">
                            {FEATURED_PRESET_IDS.map((presetId) => {
                                const preset = MCP_PRESETS[presetId];
                                if (!preset) return null;
                                const serverConfig = mcpServers[presetId];
                                const status =
                                    getConnectionStatus(serverConfig);
                                const isConnected = status === "connected";
                                const isTokenMode = showTokenInput[presetId];
                                const PresetIcon = getConnectorIcon(
                                    preset.icon,
                                );
                                return (
                                    <div
                                        key={presetId}
                                        className={classNames(
                                            "rounded-xl border p-4",
                                            "border-gray-200 dark:border-gray-600",
                                            "bg-white dark:bg-gray-800",
                                        )}
                                    >
                                        <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
                                            <div className="flex min-w-0 items-center gap-3">
                                                <PresetIcon className="w-5 h-5 flex-shrink-0" />
                                                <div>
                                                    <div className="break-words text-sm font-medium text-gray-900 dark:text-gray-100">
                                                        {preset.name}
                                                    </div>
                                                    <div className="text-xs leading-5 text-gray-500 dark:text-gray-400">
                                                        {preset.descriptionKey
                                                            ? t(
                                                                  preset.descriptionKey,
                                                              )
                                                            : preset.description}
                                                    </div>
                                                </div>
                                            </div>
                                            <Button
                                                size="default"
                                                variant={
                                                    isConnected
                                                        ? "outline"
                                                        : "default"
                                                }
                                                onClick={() =>
                                                    handleConnectPreset(
                                                        presetId,
                                                    )
                                                }
                                            >
                                                {isConnected ? (
                                                    t("Connected")
                                                ) : status === "expired" ? (
                                                    <>
                                                        <ExternalLink className="me-1 h-4 w-4" />
                                                        {t("Reconnect")}
                                                    </>
                                                ) : (
                                                    <>
                                                        <ExternalLink className="me-1 h-4 w-4" />
                                                        {t("Connect")}
                                                    </>
                                                )}
                                            </Button>
                                        </div>
                                        {isTokenMode && (
                                            <div className="mt-3 space-y-2">
                                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                                    {preset.tokenHelpText}{" "}
                                                    {preset.tokenHelpUrl && (
                                                        <a
                                                            href={
                                                                preset.tokenHelpUrl
                                                            }
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="text-blue-500 hover:underline"
                                                        >
                                                            {t("Get token")}
                                                        </a>
                                                    )}
                                                </p>
                                                <div className="flex gap-2">
                                                    <input
                                                        type="password"
                                                        placeholder={
                                                            preset.tokenPlaceholder ||
                                                            t("Paste token...")
                                                        }
                                                        value={
                                                            tokenInput[
                                                                presetId
                                                            ] || ""
                                                        }
                                                        onChange={(e) =>
                                                            setTokenInput(
                                                                (prev) => ({
                                                                    ...prev,
                                                                    [presetId]:
                                                                        e.target
                                                                            .value,
                                                                }),
                                                            )
                                                        }
                                                        className="flex-1 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                    />
                                                    <Button
                                                        size="default"
                                                        onClick={() =>
                                                            handleSaveToken(
                                                                presetId,
                                                            )
                                                        }
                                                        disabled={
                                                            !tokenInput[
                                                                presetId
                                                            ]?.trim()
                                                        }
                                                    >
                                                        {t("Save")}
                                                    </Button>
                                                    <Button
                                                        size="default"
                                                        variant="ghost"
                                                        onClick={() =>
                                                            setShowTokenInput(
                                                                (prev) => ({
                                                                    ...prev,
                                                                    [presetId]: false,
                                                                }),
                                                            )
                                                        }
                                                    >
                                                        {t("Cancel")}
                                                    </Button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div>
                        <div className="mb-2 flex items-center justify-between">
                            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                {t("Custom servers")}
                            </h4>
                            {!showCustomForm && (
                                <Button
                                    size="default"
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
                                    "rounded-xl border p-4 space-y-2",
                                    "border-gray-200 dark:border-gray-600",
                                    "bg-white dark:bg-gray-800",
                                )}
                            >
                                <input
                                    type="text"
                                    placeholder={t("Name (e.g. My Server)")}
                                    value={customForm.name}
                                    onChange={(e) =>
                                        setCustomForm((prev) => ({
                                            ...prev,
                                            name: e.target.value,
                                        }))
                                    }
                                    className="w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                                <input
                                    type="url"
                                    placeholder={t("mcp_url_placeholder")}
                                    value={customForm.url}
                                    onChange={(e) =>
                                        setCustomForm((prev) => ({
                                            ...prev,
                                            url: e.target.value,
                                        }))
                                    }
                                    className="w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                                <input
                                    type="password"
                                    placeholder={t("Bearer token (optional)")}
                                    value={customForm.token}
                                    onChange={(e) =>
                                        setCustomForm((prev) => ({
                                            ...prev,
                                            token: e.target.value,
                                        }))
                                    }
                                    className="w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                                {usesCompanion(customForm.url) ? (
                                    <p className="text-xs text-gray-500 dark:text-gray-400">
                                        {t(
                                            "This address connects through Companion automatically.",
                                        )}
                                    </p>
                                ) : (
                                    <label className="flex min-h-10 items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                                        <input
                                            type="checkbox"
                                            checked={throughComputer}
                                            onChange={(event) =>
                                                setThroughComputer(
                                                    event.target.checked,
                                                )
                                            }
                                        />
                                        {t(
                                            "Use this computer’s connection (VPN or private network)",
                                        )}
                                    </label>
                                )}
                                {!usesCompanion(customForm.url) &&
                                    !throughComputer && (
                                        <p className="text-xs text-gray-500 dark:text-gray-400">
                                            {t("mcp_custom_oauth_hint")}
                                        </p>
                                    )}
                                <div className="flex flex-wrap justify-end gap-2">
                                    <Button
                                        size="default"
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
                                    {!usesCompanion(customForm.url) &&
                                        !throughComputer && (
                                            <Button
                                                size="default"
                                                variant="outline"
                                                onClick={() =>
                                                    handleAddCustom(true)
                                                }
                                                disabled={
                                                    !canSubmitCustomServer
                                                }
                                            >
                                                <ExternalLink className="me-1 h-4 w-4" />
                                                {t("Add & connect OAuth")}
                                            </Button>
                                        )}
                                    <Button
                                        size="default"
                                        onClick={() => handleAddCustom(false)}
                                        disabled={!canSubmitCustomServer}
                                    >
                                        {t(
                                            usesCompanion(customForm.url) ||
                                                throughComputer
                                                ? "Continue in Companion"
                                                : "Add",
                                        )}
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
                            <p className="text-xs leading-5 text-gray-500 dark:text-gray-400">
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

                                    return (
                                        <li
                                            key={serverId}
                                            className={classNames(
                                                "flex flex-col items-stretch justify-between gap-3 rounded-xl border p-3 sm:flex-row sm:items-center",
                                                "border-gray-200 dark:border-gray-600",
                                                "bg-gray-50 dark:bg-gray-800/50",
                                            )}
                                        >
                                            <div className="flex flex-col min-w-0 flex-1">
                                                <span className="text-sm font-medium truncate">
                                                    {displayName}
                                                </span>
                                                {!preset && config?.url && (
                                                    <span className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                                        {config.url}
                                                    </span>
                                                )}
                                                <span className="text-xs text-gray-500 dark:text-gray-400">
                                                    {statusLabel}
                                                </span>
                                            </div>
                                            <div className="flex flex-shrink-0 items-center justify-end gap-1 sm:ms-2">
                                                {!preset && (
                                                    <Button
                                                        size="default"
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
                                                    size="default"
                                                    variant="ghost"
                                                    aria-label={t(
                                                        "Remove {{name}}",
                                                        { name: displayName },
                                                    )}
                                                    className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:text-red-300 dark:hover:bg-red-900/20"
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
        </div>
    );
}

export default function McpConfigDialog({ open, onOpenChange }) {
    const { t } = useTranslation();
    const { direction } = useContext(LanguageContext);
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                dir={direction}
                className="w-[calc(100vw-1rem)] max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg"
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
