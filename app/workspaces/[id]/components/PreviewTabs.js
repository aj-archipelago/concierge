"use client";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import OutputSandbox from "@/src/components/sandbox/OutputSandbox";
import MonacoEditor from "@monaco-editor/react";

function HtmlEditor({ value, onChange }) {
    return (
        <MonacoEditor
            height="100%"
            width="100%"
            language="html"
            theme="vs-dark"
            options={{
                fontSize: 12,
                fontWeight: "normal",
            }}
            value={value}
            onChange={onChange}
        />
    );
}

// Streaming preview component that uses dangerouslySetInnerHTML for smooth updates
function StreamingPreview({ content }) {
    return (
        <div
            className="w-full h-full overflow-auto"
            dangerouslySetInnerHTML={{
                __html: `
                    <!DOCTYPE html>
                    <html>
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
                            </style>
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
}) {
    if (!htmlVersions.length) return null;

    return (
        <Tabs
            defaultValue="preview"
            className="flex flex-col grow overflow-auto"
        >
            <TabsList>
                <TabsTrigger value="preview">Preview</TabsTrigger>
                <TabsTrigger value="code">Code</TabsTrigger>
            </TabsList>

            <div className="border rounded-md shadow-md bg-white mb-4 grow overflow-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent hover:scrollbar-thumb-gray-400">
                <div className="flex flex-col h-full">
                    <div className="flex-1 p-4">
                        <TabsContent value="preview" className="h-full m-0">
                            {isStreaming ? (
                                <StreamingPreview
                                    content={htmlVersions[activeVersionIndex]}
                                />
                            ) : (
                                <OutputSandbox
                                    content={htmlVersions[activeVersionIndex]}
                                    height="100%"
                                />
                            )}
                        </TabsContent>
                        <TabsContent value="code" className="h-full m-0">
                            <HtmlEditor
                                value={htmlVersions[activeVersionIndex]}
                                onChange={(value) => {
                                    onHtmlChange(value, activeVersionIndex);
                                }}
                            />
                        </TabsContent>
                    </div>
                </div>
            </div>
        </Tabs>
    );
}
