"use client";

import React, {
    useCallback,
    useContext,
    useEffect,
    useRef,
    useState,
} from "react";
import { useTranslation } from "react-i18next";
import {
    Monitor,
    Download,
    RefreshCw,
    ArrowUpRight,
    FolderOpen,
    Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { LanguageContext } from "../../contexts/LanguageProvider";

export default function LocalComputers({ intent, onIntentHandled } = {}) {
    const { t } = useTranslation();
    const { direction } = useContext(LanguageContext);
    const [settings, setSettings] = useState(null);
    const [devices, setDevices] = useState([]);
    const [code, setCode] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(false);
    const [launch, setLaunch] = useState(null);
    const [connected, setConnected] = useState(false);
    const startedIntent = useRef(null);
    const [platform, setPlatform] = useState("");
    const refresh = useCallback(async () => {
        const response = await fetch("/api/users/me/computers", {
            cache: "no-store",
        });
        if (!response.ok) throw new Error();
        const data = await response.json();
        setDevices(data.devices || []);
    }, []);
    useEffect(() => {
        let active = true;
        setPlatform(
            /Mac/i.test(navigator.userAgent)
                ? "mac"
                : /Windows/i.test(navigator.userAgent)
                  ? "windows"
                  : "",
        );
        fetch("/api/companion/config")
            .then(async (response) => {
                if (!response.ok) throw new Error();
                const data = await response.json();
                if (!active) return;
                setSettings(data);
                if (data.enabled) await refresh();
            })
            .catch(() => {
                if (active) setError(true);
            });
        return () => {
            active = false;
        };
    }, [refresh]);
    useEffect(() => {
        if (!settings?.enabled) return;
        const timer = setInterval(
            async () => {
                try {
                    await refresh();
                    if (launch && Date.now() < launch.expiresAt) {
                        const response = await fetch(
                            "/api/users/me/computers/connect",
                            {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ ticket: launch.ticket }),
                            },
                        );
                        if (!response.ok) throw new Error();
                        if ((await response.json()).paired) {
                            setLaunch(null);
                            setConnected(true);
                        }
                    }
                } catch {
                    setError(true);
                }
            },
            launch ? 2000 : 10000,
        );
        return () => clearInterval(timer);
    }, [settings?.enabled, refresh, launch]);
    const connect = useCallback(
        async (nextIntent = { kind: "connect" }) => {
            setBusy(true);
            setConnected(false);
            setError(false);
            try {
                const response = await fetch(
                    "/api/users/me/computers/connect",
                    {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ intent: nextIntent }),
                    },
                );
                if (!response.ok) throw new Error();
                const data = await response.json();
                const link = new URL(data.deepLink);
                if (
                    link.protocol !== "concierge-companion:" ||
                    link.hostname !== "connect" ||
                    link.searchParams.get("site") !== window.location.origin
                )
                    throw new Error();
                setLaunch({
                    intent: nextIntent,
                    ticket: link.searchParams.get("ticket"),
                    expiresAt: Date.now() + data.expiresIn * 1000,
                });
                onIntentHandled?.();
                window.location.href = link.href;
            } catch {
                setError(true);
            } finally {
                setBusy(false);
            }
        },
        [onIntentHandled],
    );
    useEffect(() => {
        if (intent && settings?.enabled && startedIntent.current !== intent) {
            startedIntent.current = intent;
            connect(intent);
        }
    }, [intent, settings?.enabled, connect]);
    async function act(method, body) {
        setBusy(true);
        setError(false);
        try {
            if (method) {
                const response = await fetch("/api/users/me/computers", {
                    method,
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(body),
                });
                if (!response.ok) throw new Error();
                setCode("");
            }
            await refresh();
        } catch {
            setError(true);
        } finally {
            setBusy(false);
        }
    }
    const online = devices.some((d) => d.online);
    const downloads = Object.entries(settings?.downloads || {}).sort(
        ([a], [b]) => (a === platform ? -1 : b === platform ? 1 : 0),
    );
    return (
        <section
            aria-label={t("Concierge Companion")}
            dir={direction}
            className="space-y-4 rounded-xl border border-gray-200 bg-white p-4 text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
        >
            <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-900">
                    <Monitor className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                    <h4 className="text-sm font-semibold">
                        {t("Concierge Companion")}
                    </h4>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                        {t("Your tools, wherever they run.")}
                    </p>
                </div>
                {online && (
                    <Check
                        className="mt-1 h-5 w-5 shrink-0 text-green-700 dark:text-green-400"
                        aria-label={t("Online")}
                    />
                )}
            </div>
            {error && (
                <p
                    role="alert"
                    className="text-sm text-red-700 dark:text-red-400"
                >
                    {t("Could not update the connection. Please try again.")}
                </p>
            )}
            {!settings && !error && (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                    {t("Loading...")}
                </p>
            )}
            {settings && !settings.enabled && (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                    {t(
                        "Your administrator has not enabled local computers yet.",
                    )}
                </p>
            )}
            {settings?.enabled && (
                <>
                    <p className="text-sm text-gray-600 dark:text-gray-300">
                        {t(
                            "Connect once. Your apps and chosen folders are then available in Concierge.",
                        )}
                    </p>
                    {intent && (
                        <p
                            role="status"
                            className="break-words text-sm font-medium"
                        >
                            {t("Ready to connect {{name}}", {
                                name:
                                    intent.name || t("Files on this computer"),
                            })}
                        </p>
                    )}
                    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                        <Button
                            disabled={busy}
                            className="min-h-10"
                            onClick={() => connect(intent || launch?.intent)}
                        >
                            <ArrowUpRight className="me-2 h-4 w-4" />
                            {t(
                                launch
                                    ? "Open Companion"
                                    : "Connect this computer",
                            )}
                        </Button>
                        <Button
                            disabled={busy}
                            variant="outline"
                            className="min-h-10"
                            onClick={() => connect({ kind: "files" })}
                        >
                            <FolderOpen className="me-2 h-4 w-4" />
                            {t("Choose a folder")}
                        </Button>
                    </div>
                    {launch && (
                        <div
                            role="status"
                            className="space-y-2 rounded-lg bg-gray-50 p-3 text-sm text-gray-600 dark:bg-gray-900 dark:text-gray-300"
                        >
                            <p className="font-medium text-gray-900 dark:text-gray-100">
                                {t("Approve the connection in Companion.")}
                            </p>
                            <p>
                                {t(
                                    "If it has not opened, install it below, then select Open Companion. This page will update automatically.",
                                )}
                            </p>
                        </div>
                    )}
                    {connected && (
                        <p
                            role="status"
                            className="text-sm text-green-700 dark:text-green-400"
                        >
                            {t(
                                "Connected. This computer is ready in Concierge.",
                            )}
                        </p>
                    )}
                    <div className="flex flex-wrap gap-2">
                        {downloads.map(([os, url]) => (
                            <Button
                                key={os}
                                asChild
                                variant="ghost"
                                className="min-h-10"
                            >
                                <a href={url}>
                                    <Download className="me-2 h-4 w-4" />
                                    {t(
                                        os === "mac"
                                            ? "Download for Mac"
                                            : "Download for Windows",
                                    )}
                                </a>
                            </Button>
                        ))}
                    </div>
                    {!downloads.length && (
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                            {t(
                                "Get the companion installer from your administrator.",
                            )}
                        </p>
                    )}
                    <ul className="space-y-2">
                        {devices.map((device) => (
                            <li
                                key={device.id}
                                className="flex flex-col gap-3 rounded-lg bg-gray-50 p-3 dark:bg-gray-900 sm:flex-row sm:items-center sm:justify-between"
                            >
                                <div className="min-w-0">
                                    <div className="break-words text-sm font-medium">
                                        {device.name}
                                    </div>
                                    <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                                        <span
                                            className={`h-1.5 w-1.5 rounded-full ${device.online ? "bg-green-600 dark:bg-green-400" : "bg-gray-400 dark:bg-gray-500"}`}
                                        />
                                        {t(
                                            device.online
                                                ? "Online"
                                                : "Offline",
                                        )}
                                        {" · "}
                                        {t("{{count}} connectors", {
                                            count: device.servers.length,
                                        })}
                                    </div>
                                    {device.servers.length > 0 && (
                                        <p className="mt-1 break-words text-xs text-gray-500 dark:text-gray-400">
                                            {device.servers
                                                .map((server) => server.name)
                                                .join(", ")}
                                        </p>
                                    )}
                                </div>
                                <Button
                                    variant="outline"
                                    disabled={busy}
                                    className="min-h-10 shrink-0"
                                    onClick={() =>
                                        act("DELETE", { deviceId: device.id })
                                    }
                                >
                                    {t("Disconnect")}
                                </Button>
                            </li>
                        ))}
                    </ul>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                        {t(
                            "Computer tools need this computer awake. Cloud connectors stay available independently.",
                        )}
                    </p>
                    <details className="text-sm">
                        <summary className="min-h-10 cursor-pointer py-2 text-gray-500 dark:text-gray-400">
                            {t("Troubleshooting")}
                        </summary>
                        <Button
                            variant="ghost"
                            disabled={busy}
                            className="min-h-10"
                            onClick={() => act()}
                        >
                            <RefreshCw className="me-2 h-4 w-4" />
                            {t("Refresh status")}
                        </Button>
                        <form
                            className="mt-2 space-y-2"
                            onSubmit={(event) => {
                                event.preventDefault();
                                act("POST", { code });
                            }}
                        >
                            <label
                                htmlFor="companion-code"
                                className="block text-sm font-medium"
                            >
                                {t("Pairing code")}
                            </label>
                            <div className="flex flex-col gap-2 sm:flex-row">
                                <input
                                    id="companion-code"
                                    dir="ltr"
                                    value={code}
                                    onChange={(event) =>
                                        setCode(event.target.value)
                                    }
                                    maxLength={20}
                                    placeholder="ABCD-1234-EF56"
                                    autoComplete="off"
                                    spellCheck={false}
                                    className="min-h-10 min-w-0 flex-1 rounded-md border border-gray-300 bg-white px-3 py-2 font-mono text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                                />
                                <Button
                                    type="submit"
                                    disabled={
                                        busy ||
                                        !/^[a-fA-F0-9]{12}$/.test(
                                            code.replace(/[\s-]/g, ""),
                                        )
                                    }
                                    className="min-h-10"
                                >
                                    {t("Connect computer")}
                                </Button>
                            </div>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                {t(
                                    "Only enter the code shown by the companion on your own computer. Connecting allows Concierge to use the local tools you enable there.",
                                )}
                            </p>
                        </form>
                    </details>
                </>
            )}
        </section>
    );
}
