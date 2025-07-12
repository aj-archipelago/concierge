"use client";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import OutputSandbox from "@/src/components/sandbox/OutputSandbox";
import MonacoEditor from "@monaco-editor/react";
import { useContext } from "react";
import { useTranslation } from "react-i18next";
import { ThemeContext } from "@/src/contexts/ThemeProvider";

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
                        "The AI is generating your applet. You can see the preview updating in real-time as the code is being written.",
                    )}
                </p>
            </div>
        </div>
    );
}

// Streaming preview component that uses dangerouslySetInnerHTML for smooth updates
function StreamingPreview({ content, theme }) {
    return (
        <div
            className="w-full h-full overflow-auto min-w-0"
            dangerouslySetInnerHTML={{
                __html: `
                    <!DOCTYPE html>
                    <html data-theme="${theme}">
                        <head>
                            <meta charset="utf-8">
                            <meta name="viewport" content="width=device-width, initial-scale=1">
                            <style>
                                body { 
                                    margin: 0; 
                                    font-family: system-ui, -apple-system, sans-serif;
                                }
                                /* Ensure images don't overflow */
                                img { max-width: 100%; height: auto; }
                                
                                /* Theme-aware styles for applets */
                                html[data-theme="dark"] {
                                    color-scheme: dark;
                                }
                                html[data-theme="light"] {
                                    color-scheme: light;
                                }
                                
                                /* CSS custom property for applets to use */
                                :root {
                                    --prefers-color-scheme: ${theme};
                                }
                            </style>
                            <script>
                                // Make theme available to applets via JavaScript
                                window.LABEEB_THEME = "${theme}";
                                window.LABEEB_PREFERS_COLOR_SCHEME = "${theme}";
                            </script>
                        </head>
                        <body>${content}</body>
                    </html>
                `,
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

            <div className="border rounded-md shadow-md bg-white mb-4 flex-1 min-w-0 overflow-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent hover:scrollbar-thumb-gray-400 relative">
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
