"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import MonacoEditor from "@monaco-editor/react";
import { APPLET_SDK_DOCUMENTATION } from "../../../src/content/appletSdkDocumentation.js";
import { runAppletServiceOAuth } from "@/src/utils/appletServiceOAuth";

const APPLET_ID_PLACEHOLDER = "YOUR_APPLET_ID";
const OBJECT_ID_RE = /^[a-f0-9]{24}$/i;

function injectAppletId(html, appletId) {
    if (!appletId) return html;
    return html.replace(
        /(<meta\s+name=["']applet-id["']\s+content=["'])([^"']*)(["'])/i,
        `$1${appletId}$3`,
    );
}

const DEFAULT_APPLET = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="concierge-type" content="applet">
    <!-- Applet ID is injected from the playground toolbar when you Run -->
    <meta name="applet-id" content="${APPLET_ID_PLACEHOLDER}">
    <title>SDK Playground</title>
    <script src="/applet-sdk.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>
    <style>
        body { font-family: system-ui, sans-serif; }
    </style>
</head>
<body class="bg-gray-50 p-6">
    <div class="max-w-lg mx-auto space-y-4">
        <h1 class="text-xl font-bold text-gray-900">Concierge SDK Playground</h1>

        <div class="bg-white rounded-lg border border-gray-200 p-4 space-y-3">
            <p class="text-sm text-gray-600">
                SDK Version: <strong id="sdk-version">checking...</strong>
            </p>
            <div class="space-y-2">
                <label class="block text-sm text-gray-600">
                    Message
                    <textarea
                        id="agent-chat-message"
                        rows="3"
                        class="mt-1 w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md resize-y"
                    >Say hello in 3 languages in one short line.</textarea>
                </label>
                <div class="flex flex-wrap gap-2">
                <button
                    onclick="runAgentChat()"
                    class="px-3 py-1.5 text-sm font-medium bg-purple-600 text-white rounded-md hover:bg-purple-700"
                >
                    agent.chat()
                </button>
                <button
                    onclick="runGetToken('atlassian')"
                    class="px-3 py-1.5 text-sm font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                    services.getAccessToken("atlassian")
                </button>
                <button
                    onclick="runGetToken('github')"
                    class="px-3 py-1.5 text-sm font-medium bg-gray-700 text-white rounded-md hover:bg-gray-800"
                >
                    services.getAccessToken("github")
                </button>
                <button
                    onclick="runGetToken('slack')"
                    class="px-3 py-1.5 text-sm font-medium bg-green-600 text-white rounded-md hover:bg-green-700"
                >
                    services.getAccessToken("slack")
                </button>
                </div>
            </div>
        </div>

        <div class="bg-white rounded-lg border border-gray-200 p-4 space-y-3">
            <p class="text-sm font-medium text-gray-800">ConciergeSDK.data</p>
            <p class="text-xs text-gray-500">Requires a valid applet ID (set in the toolbar above the preview).</p>
            <div class="flex flex-wrap gap-2">
                <button
                    onclick="runDataGet()"
                    class="px-3 py-1.5 text-sm font-medium bg-amber-600 text-white rounded-md hover:bg-amber-700"
                >
                    data.get()
                </button>
                <button
                    onclick="runDataSet()"
                    class="px-3 py-1.5 text-sm font-medium bg-amber-700 text-white rounded-md hover:bg-amber-800"
                >
                    data.set("playgroundDemo", …)
                </button>
            </div>
        </div>

        <div class="bg-white rounded-lg border border-gray-200 p-4 space-y-3">
            <p class="text-sm font-medium text-gray-800">ConciergeSDK.files</p>
            <div class="flex flex-wrap gap-2 items-center">
                <button
                    onclick="runFilesList()"
                    class="px-3 py-1.5 text-sm font-medium bg-teal-600 text-white rounded-md hover:bg-teal-700"
                >
                    files.list()
                </button>
                <label class="text-sm text-gray-600">
                    <span class="sr-only">Upload file</span>
                    <input type="file" id="file-input" class="text-xs max-w-[200px]" />
                </label>
                <button
                    onclick="runFilesUpload()"
                    class="px-3 py-1.5 text-sm font-medium bg-teal-700 text-white rounded-md hover:bg-teal-800"
                >
                    files.upload(selected)
                </button>
            </div>
        </div>

        <div class="bg-gray-900 rounded-lg p-4">
            <p class="text-xs text-gray-400 mb-2 font-mono">Console output:</p>
            <pre id="output" class="text-sm text-green-400 font-mono whitespace-pre-wrap"></pre>
        </div>
    </div>

    <script>
        var outputEl = document.getElementById("output");
        var versionEl = document.getElementById("sdk-version");

        function log(msg) {
            outputEl.textContent += msg + "\\n";
        }

        // Check SDK availability
        if (window.ConciergeSDK) {
            versionEl.textContent = "v" + ConciergeSDK.version;
            log("[ready] ConciergeSDK v" + ConciergeSDK.version + " loaded");
        } else {
            versionEl.textContent = "NOT LOADED";
            versionEl.style.color = "red";
            log("[error] ConciergeSDK is not available on window");
        }

        function getAppletId() {
            var meta = document.querySelector('meta[name="applet-id"]');
            return meta && meta.content ? meta.content.trim() : "";
        }

        async function runAgentChat() {
            if (!window.ConciergeSDK) { log("[error] SDK not loaded"); return; }
            var appletId = getAppletId();
            if (!appletId || appletId === "${APPLET_ID_PLACEHOLDER}" || !/^[a-f0-9]{24}$/i.test(appletId)) {
                log("[agent.chat] select a valid applet ID in the toolbar, then click Run");
                return;
            }
            var msgEl = document.getElementById("agent-chat-message");
            var message = msgEl ? msgEl.value.trim() : "";
            if (!message) {
                log("[agent.chat] enter a message first");
                return;
            }
            log("[agent.chat] sending: " + message);
            try {
                var response = await ConciergeSDK.agent.chat({
                    messages: [{ role: "user", content: message }],
                    systemPrompt: "You are a helpful, concise assistant. Keep responses under 50 words.",
                });
                log("[agent.chat] result: " + response.result);
                if (response.warnings && response.warnings.length > 0) {
                    log("[agent.chat] warnings: " + JSON.stringify(response.warnings));
                }
            } catch (err) {
                log("[agent.chat] error: " + err.message);
            }
        }

        async function runGetToken(service) {
            if (!window.ConciergeSDK) { log("[error] SDK not loaded"); return; }
            log("[services.getAccessToken] requesting " + service + " token...");
            try {
                var result = await ConciergeSDK.services.getAccessToken({ service: service });
                log("[services.getAccessToken] service: " + result.service);
                log("[services.getAccessToken] token: " + result.token.slice(0, 20) + "...");
                log("[services.getAccessToken] expiresAt: " + (result.expiresAt ? new Date(result.expiresAt).toISOString() : "null"));
                if (result.metadata && Object.keys(result.metadata).length > 0) {
                    log("[services.getAccessToken] metadata: " + JSON.stringify(result.metadata));
                }
            } catch (err) {
                log("[services.getAccessToken] error: " + err.message + (err.code ? " (code: " + err.code + ")" : ""));
            }
        }

        async function runDataGet() {
            if (!window.ConciergeSDK) { log("[error] SDK not loaded"); return; }
            log("[data.get] …");
            try {
                var data = await ConciergeSDK.data.get();
                log("[data.get] " + JSON.stringify(data));
            } catch (err) {
                log("[data.get] error: " + err.message);
            }
        }

        async function runDataSet() {
            if (!window.ConciergeSDK) { log("[error] SDK not loaded"); return; }
            var payload = { at: new Date().toISOString(), n: Math.floor(Math.random() * 1000) };
            log("[data.set] playgroundDemo = " + JSON.stringify(payload));
            try {
                var updated = await ConciergeSDK.data.set("playgroundDemo", payload);
                log("[data.set] full store: " + JSON.stringify(updated));
            } catch (err) {
                log("[data.set] error: " + err.message);
            }
        }

        async function runFilesList() {
            if (!window.ConciergeSDK) { log("[error] SDK not loaded"); return; }
            log("[files.list] …");
            try {
                var files = await ConciergeSDK.files.list();
                log("[files.list] count: " + files.length);
                files.slice(0, 5).forEach(function (f, i) {
                    log("  [" + i + "] " + (f.originalName || f.filename || "?") + " id=" + (f._id || "?"));
                });
                if (files.length > 5) log("  … +" + (files.length - 5) + " more");
            } catch (err) {
                log("[files.list] error: " + err.message);
            }
        }

        async function runFilesUpload() {
            if (!window.ConciergeSDK) { log("[error] SDK not loaded"); return; }
            var input = document.getElementById("file-input");
            if (!input || !input.files || !input.files[0]) {
                log("[files.upload] pick a file first");
                return;
            }
            log("[files.upload] …");
            try {
                var result = await ConciergeSDK.files.upload(input.files[0]);
                log("[files.upload] file: " + JSON.stringify(result.file || {}));
                if (result.file && result.file._id) {
                    var url = ConciergeSDK.files.getContentUrl(result.file._id);
                    log("[files.getContentUrl] " + url);
                }
            } catch (err) {
                log("[files.upload] error: " + err.message);
            }
        }
    </script>
</body>
</html>`;

export default function SdkPlaygroundPage() {
    const [activeTab, setActiveTab] = useState("playground");
    const [code, setCode] = useState(DEFAULT_APPLET);
    const [previewHtml, setPreviewHtml] = useState(DEFAULT_APPLET);
    const [appletId, setAppletId] = useState("");
    const [applets, setApplets] = useState([]);
    const iframeRef = useRef(null);

    const applyPreview = useCallback(
        (html, id = appletId) => {
            setPreviewHtml(injectAppletId(html, id));
        },
        [appletId],
    );

    const handleRun = useCallback(() => {
        applyPreview(code);
    }, [applyPreview, code]);

    useEffect(() => {
        fetch("/api/canvas-applets")
            .then((res) => (res.ok ? res.json() : Promise.reject()))
            .then((data) => {
                const list = data.applets || [];
                setApplets(list);
                if (list.length > 0) {
                    const id = list[0]._id;
                    setAppletId(id);
                    setPreviewHtml(injectAppletId(DEFAULT_APPLET, id));
                }
            })
            .catch(() => {
                /* user can paste an ID manually */
            });
    }, []);

    useEffect(() => {
        const handleMessage = (event) => {
            if (
                event.origin !== window.location.origin ||
                !event.data ||
                event.data.type !== "__OAUTH_REQUEST__" ||
                !iframeRef.current ||
                event.source !== iframeRef.current.contentWindow
            ) {
                return;
            }
            const { requestId, connectInfo } = event.data;
            const reply = (payload) => {
                try {
                    iframeRef.current?.contentWindow?.postMessage(
                        { type: "__OAUTH_RESPONSE__", requestId, ...payload },
                        window.location.origin,
                    );
                } catch {
                    /* iframe unmounted */
                }
            };
            runAppletServiceOAuth(connectInfo)
                .then(() => reply({ success: true }))
                .catch((err) =>
                    reply({
                        success: false,
                        error: err.message,
                        code: err.code,
                    }),
                );
        };
        window.addEventListener("message", handleMessage);
        return () => window.removeEventListener("message", handleMessage);
    }, []);

    const handleReset = useCallback(() => {
        setCode(DEFAULT_APPLET);
        applyPreview(DEFAULT_APPLET);
    }, [applyPreview]);

    const handleAppletIdChange = useCallback(
        (nextId) => {
            setAppletId(nextId);
            if (OBJECT_ID_RE.test(nextId)) {
                applyPreview(code, nextId);
            }
        },
        [applyPreview, code],
    );

    const sdkDetected = code.includes("applet-sdk.js");

    return (
        <div
            className="p-6 flex flex-col"
            style={{ height: "calc(100vh - 100px)" }}
        >
            {/* Header */}
            <div className="flex items-center justify-between flex-shrink-0 mb-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                        Concierge Applet SDK
                    </h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        Documentation and interactive playground for the Applet
                        SDK
                    </p>
                </div>
                <span className="text-xs font-mono text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
                    v1.5.0
                </span>
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-0 border-b border-gray-200 dark:border-gray-700 flex-shrink-0 mb-4">
                <button
                    onClick={() => setActiveTab("docs")}
                    className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                        activeTab === "docs"
                            ? "border-sky-600 text-gray-900 dark:text-gray-100 dark:border-sky-400"
                            : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300"
                    }`}
                >
                    Documentation
                </button>
                <button
                    onClick={() => setActiveTab("playground")}
                    className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                        activeTab === "playground"
                            ? "border-sky-600 text-gray-900 dark:text-gray-100 dark:border-sky-400"
                            : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300"
                    }`}
                >
                    Playground
                </button>
            </div>

            {/* Tab content */}
            <div className="flex-1 min-h-0 overflow-hidden">
                {/* Documentation tab */}
                {activeTab === "docs" && (
                    <div className="h-full overflow-auto border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800/50 p-8">
                        <div className="max-w-3xl mx-auto prose prose-sm dark:prose-invert prose-pre:bg-gray-900 prose-pre:text-gray-100 prose-code:text-sky-600 dark:prose-code:text-sky-400 prose-pre:prose-code:text-gray-100 prose-code:before:content-none prose-code:after:content-none">
                            <Markdown remarkPlugins={[remarkGfm]}>
                                {APPLET_SDK_DOCUMENTATION}
                            </Markdown>
                        </div>
                    </div>
                )}

                {/* Playground tab */}
                {activeTab === "playground" && (
                    <div className="h-full flex flex-col">
                        {/* Toolbar */}
                        <div className="flex flex-wrap items-center gap-2 pb-3 flex-shrink-0">
                            <button
                                onClick={handleRun}
                                className="px-4 py-2 text-sm font-medium bg-sky-600 text-white rounded-md hover:bg-sky-700 transition-colors"
                            >
                                Run
                            </button>
                            <button
                                onClick={handleReset}
                                className="px-4 py-2 text-sm font-medium bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 transition-colors"
                            >
                                Reset
                            </button>
                            <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                                <span className="whitespace-nowrap">
                                    Applet
                                </span>
                                {applets.length > 0 ? (
                                    <select
                                        value={appletId}
                                        onChange={(e) =>
                                            handleAppletIdChange(e.target.value)
                                        }
                                        className="min-w-[12rem] max-w-[20rem] px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                                    >
                                        {applets.map((applet) => (
                                            <option
                                                key={applet._id}
                                                value={applet._id}
                                            >
                                                {applet.name || applet._id}
                                            </option>
                                        ))}
                                    </select>
                                ) : (
                                    <input
                                        type="text"
                                        value={appletId}
                                        onChange={(e) =>
                                            handleAppletIdChange(
                                                e.target.value.trim(),
                                            )
                                        }
                                        placeholder="Canvas applet _id"
                                        className="min-w-[16rem] px-2 py-1.5 text-sm font-mono border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                                    />
                                )}
                            </label>
                            <div className="ml-auto">
                                {sdkDetected ? (
                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                                        <span className="w-1.5 h-1.5 rounded-full bg-current" />
                                        SDK detected in source
                                    </span>
                                ) : (
                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                                        <span className="w-1.5 h-1.5 rounded-full bg-current" />
                                        SDK not detected
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* Editor + Preview */}
                        <div className="grid grid-cols-2 gap-4 flex-1 min-h-0">
                            {/* Code Editor */}
                            <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden flex flex-col">
                                <div className="px-3 py-2 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 text-xs font-medium text-gray-500 dark:text-gray-400">
                                    Editor
                                </div>
                                <div className="flex-1">
                                    <MonacoEditor
                                        height="100%"
                                        language="html"
                                        theme="vs-dark"
                                        value={code}
                                        onChange={(value) =>
                                            setCode(value || "")
                                        }
                                        options={{
                                            fontSize: 13,
                                            minimap: { enabled: false },
                                            wordWrap: "on",
                                            lineNumbers: "on",
                                            scrollBeyondLastLine: false,
                                            tabSize: 2,
                                        }}
                                    />
                                </div>
                            </div>

                            {/* Preview */}
                            <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden flex flex-col">
                                <div className="px-3 py-2 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 text-xs font-medium text-gray-500 dark:text-gray-400">
                                    Preview
                                </div>
                                <div className="flex-1 bg-white">
                                    <iframe
                                        ref={iframeRef}
                                        title="SDK Playground Preview"
                                        srcDoc={previewHtml}
                                        sandbox="allow-scripts allow-same-origin"
                                        className="w-full h-full border-0"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
