"use client";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import OutputSandbox from "@/src/components/sandbox/OutputSandbox";
import MonacoEditor from "@monaco-editor/react";
import { useContext } from "react";
import { useTranslation } from "react-i18next";
import { ThemeContext } from "@/src/contexts/ThemeProvider";
import { generateFilteredSandboxHtml } from "@/src/utils/themeUtils";

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
}) {
    const { t } = useTranslation();
    const { theme } = useContext(ThemeContext);

    if (!htmlVersions.length) return null;

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
                            {isStreaming && hasStreamingVersion ? (
                                <StreamingPreview
                                    content={htmlVersions[activeVersionIndex]}
                                    theme={theme}
                                />
                            ) : (
                                <OutputSandbox
                                    content={htmlVersions[activeVersionIndex]}
                                    height="100%"
                                    theme={theme}
                                />
                            )}
                        </TabsContent>
                        <TabsContent
                            value="code"
                            className="h-full m-0 min-w-0"
                        >
                            <HtmlEditor
                                value={htmlVersions[activeVersionIndex]}
                                onChange={
                                    isOwner
                                        ? (value) => {
                                              onHtmlChange(
                                                  value,
                                                  activeVersionIndex,
                                              );
                                          }
                                        : undefined
                                }
                                options={{
                                    readOnly: !isOwner,
                                }}
                            />
                        </TabsContent>
                    </div>
                </div>
            </div>
        </Tabs>
    );
}
