"use client";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import OutputSandbox from "@/src/components/sandbox/OutputSandbox";
import MonacoEditor from "@monaco-editor/react";
import { useContext } from "react";
import { useTranslation } from "react-i18next";
import { ThemeContext } from "@/src/contexts/ThemeProvider";
import { generateFilteredSandboxHtml } from "../../../../src/utils/themeUtils";

function HtmlEditor({ value, onChange, options }) {
    return (
        <MonacoEditor
            height="100%"
            width="100%"
            language="html"
            theme="vs-dark"
            options={{
                fontSize: 12,
                fontWeight: "normal",
                ...options,
            }}
            value={value}
            onChange={onChange}
        />
    );
}

// Creating Applet Dialog Component
function CreatingAppletDialog({ isVisible }) {
    const { t } = useTranslation();

    if (!isVisible) return null;

    return (
        <div className="absolute inset-0 bg-white/5 backdrop-blur-sm flex items-center justify-center z-10">
            <div className="bg-white rounded-lg shadow-lg p-6 max-w-sm mx-4">
                <div className="flex items-center gap-3 mb-3">
                    <div className="w-5 h-5 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
                    <h3 className="text-lg font-semibold text-gray-900">
                        {t("Creating Applet...")}
                    </h3>
                </div>
                <p className="text-sm text-gray-600">
                    {t(
                        "The AI is generating your applet. The preview will update in real-time as the code is being written.",
                    )}
                </p>
            </div>
        </div>
    );
}

// Empty state placeholder component
function EmptyStatePlaceholder() {
    const { t } = useTranslation();

    return (
        <div className="flex flex-col items-center justify-center h-full text-center p-8">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                <svg
                    className="w-8 h-8 text-gray-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
                {t("No applet created yet")}
            </h3>
            <p className="text-gray-600 max-w-md">
                {t(
                    "Use the chat interface to describe your desired UI, or paste HTML code directly in the Code tab to create your first version.",
                )}
            </p>
        </div>
    );
}

// Loading state component
function LoadingStatePlaceholder() {
    const { t } = useTranslation();

    return (
        <div className="flex flex-col items-center justify-center h-full text-center p-8">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                <div className="w-8 h-8 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
                {t("Loading applet...")}
            </h3>
            <p className="text-gray-600 max-w-md">
                {t("Please wait while we load your applet data.")}
            </p>
        </div>
    );
}

// Streaming preview component that uses dangerouslySetInnerHTML for smooth updates
function StreamingPreview({ content, theme }) {
    // Generate the filtered HTML document using the shared template
    const filteredHtml = generateFilteredSandboxHtml(content, theme);

    return (
        <div
            className="w-full h-full overflow-auto min-w-0"
            dangerouslySetInnerHTML={{
                __html: filteredHtml,
            }}
        />
    );
}

export default function PreviewTabs({
    htmlVersions,
    activeVersionIndex,
    onHtmlChange,
    isStreaming = false,
    isOwner = true,
    hasStreamingVersion = false,
    showCreatingDialog = false,
    isLoading = false,
    isCurrentVersionPublished = false,
}) {
    const { t } = useTranslation();
    const { theme } = useContext(ThemeContext);

    const hasVersions = htmlVersions.length > 0;
    const currentContent = hasVersions ? htmlVersions[activeVersionIndex] : "";

    return (
        <Tabs
            defaultValue="preview"
            className="flex flex-col grow overflow-auto"
        >
            <TabsList>
                <TabsTrigger value="preview">{t("Preview")}</TabsTrigger>
                <TabsTrigger value="code">{t("Code")}</TabsTrigger>
            </TabsList>

            <div className="border rounded-md shadow-md bg-white flex-1 min-w-0 overflow-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent hover:scrollbar-thumb-gray-400 relative">
                <CreatingAppletDialog isVisible={showCreatingDialog} />
                <div className="flex flex-col h-full">
                    <div className="flex-1 p-4">
                        <TabsContent
                            value="preview"
                            className="h-full m-0 min-w-0"
                        >
                            {isLoading ? (
                                <LoadingStatePlaceholder />
                            ) : !hasVersions ? (
                                <EmptyStatePlaceholder />
                            ) : isStreaming && hasStreamingVersion ? (
                                <StreamingPreview
                                    content={currentContent}
                                    theme={theme}
                                />
                            ) : (
                                <OutputSandbox
                                    content={currentContent}
                                    height="100%"
                                    theme={theme}
                                />
                            )}
                        </TabsContent>
                        <TabsContent
                            value="code"
                            className="h-full m-0 min-w-0"
                        >
                            {isLoading ? (
                                <LoadingStatePlaceholder />
                            ) : (
                                <>
                                    {isCurrentVersionPublished && (
                                        <div className="mb-3 p-2 bg-blue-50 border border-blue-200 rounded-md">
                                            <div className="flex items-center gap-2 text-blue-800 text-sm">
                                                <span className="text-blue-600">
                                                    🔒
                                                </span>
                                                <span>
                                                    {t(
                                                        "This version is published and cannot be edited",
                                                    )}
                                                </span>
                                            </div>
                                        </div>
                                    )}
                                    <HtmlEditor
                                        value={currentContent}
                                        onChange={
                                            isOwner &&
                                            !isCurrentVersionPublished
                                                ? (value) => {
                                                      onHtmlChange(
                                                          value,
                                                          activeVersionIndex,
                                                      );
                                                  }
                                                : undefined
                                        }
                                        options={{
                                            readOnly:
                                                !isOwner ||
                                                isCurrentVersionPublished,
                                        }}
                                    />
                                </>
                            )}
                        </TabsContent>
                    </div>
                </div>
            </div>
        </Tabs>
    );
}
