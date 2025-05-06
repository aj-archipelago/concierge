"use client";
import { cn } from "@/lib/utils";
import { LanguageContext } from "@/src/contexts/LanguageProvider";
import { ArrowLeftIcon, ArrowRightIcon, TrashIcon } from "lucide-react";
import { useParams } from "next/navigation";
import { useContext, useEffect, useState } from "react";
import { RiRefreshLine, RiSendPlane2Fill } from "react-icons/ri";
import ReactMarkdown from "react-markdown";
import TextareaAutosize from "react-textarea-autosize";
import {
    useUpdateWorkspaceApplet,
    useWorkspaceApplet,
    useWorkspaceChat,
    useWorkspaceSuggestions,
} from "../../../queries/workspaces";
import LLMSelector from "../../components/LLMSelector";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { MonacoEditor } from "@monaco-editor/react";
export default function WorkspaceApplet() {
    const { id } = useParams();
    const [selectedLLM, setSelectedLLM] = useState("");
    const [messages, setMessages] = useState([]);
    const [inputMessage, setInputMessage] = useState("");
    const [previewHtml, setPreviewHtml] = useState(null);
    const [htmlVersions, setHtmlVersions] = useState([]);
    const [activeVersionIndex, setActiveVersionIndex] = useState(-1);
    const [isLoading, setIsLoading] = useState(false);
    const [publishedVersionIndex, setPublishedVersionIndex] = useState(null);
    const suggestionsMutation = useWorkspaceSuggestions(id, selectedLLM);
    const appletQuery = useWorkspaceApplet(id);
    const updateApplet = useUpdateWorkspaceApplet();
    const chatMutation = useWorkspaceChat(id);
    const { direction } = useContext(LanguageContext);

    useEffect(() => {
        if (
            selectedLLM &&
            !appletQuery.data?.suggestions?.length &&
            !appletQuery.isLoading
        ) {
            // Only generate suggestions if they don't exist yet
            suggestionsMutation.mutate(undefined, {
                onSuccess: (data) => {
                    updateApplet.mutate({
                        id,
                        data: {
                            suggestions: data.map((suggestion) => ({
                                name: suggestion.name,
                                uxDescription: suggestion.ux_description,
                            })),
                        },
                    });
                },
            });
        }
    }, [selectedLLM]);

    useEffect(() => {
        if (appletQuery.data) {
            setMessages(appletQuery.data.messages || []);
            if (appletQuery.data.htmlVersions?.length > 0) {
                setHtmlVersions(
                    appletQuery.data.htmlVersions.map((v) => v.content),
                );
                setActiveVersionIndex(appletQuery.data.htmlVersions.length - 1);
                setPreviewHtml(
                    appletQuery.data.htmlVersions[
                        appletQuery.data.htmlVersions.length - 1
                    ].content,
                );
            }
            setPublishedVersionIndex(
                typeof appletQuery.data.publishedVersionIndex === "number"
                    ? appletQuery.data.publishedVersionIndex
                    : null,
            );
        }
    }, [appletQuery.data]);

    const handleSendMessage = async () => {
        if (!inputMessage.trim() || !selectedLLM) return;

        const newMessage = {
            content: inputMessage,
            role: "user",
            timestamp: new Date().toISOString(),
        };

        const updatedMessages = [...messages, newMessage];
        setMessages(updatedMessages);
        setInputMessage("");
        setIsLoading(true);

        // Save messages to applet
        updateApplet.mutate({
            id,
            data: { messages: updatedMessages },
        });

        try {
            const response = await chatMutation.mutateAsync({
                messages: updatedMessages,
                model: selectedLLM,
                currentHtml: previewHtml,
            });

            const aiMessage = {
                content: response.message,
                role: "assistant",
                timestamp: new Date().toISOString(),
            };

            // Check if the message is HTML code (enclosed in backticks)
            if (
                response.message.startsWith("`") &&
                response.message.endsWith("`")
            ) {
                // Remove backticks, html prefix, and any whitespace around them more thoroughly
                const htmlCode = response.message
                    .replace(/^`+\s*html\s*/, "") // Remove backticks and html prefix only at start
                    .replace(/^`+/, "") // Remove any remaining backticks at start
                    .replace(/`+$/, "") // Remove backticks at end
                    .replace(/``+/g, ""); // Remove any remaining double/triple backticks
                setPreviewHtml(htmlCode);
                // Add new version to history
                const newVersions = [...htmlVersions, htmlCode];
                setHtmlVersions(newVersions);
                setActiveVersionIndex(newVersions.length - 1);

                // Update the applet with new HTML version
                updateApplet.mutate({
                    id,
                    data: {
                        html: htmlCode,
                        messages: updatedMessages,
                    },
                });

                aiMessage.content =
                    "HTML code generated. Check the preview pane →";
            } else {
                // For text messages, keep the existing preview HTML
                aiMessage.content = response.message;
                // If the message contains backticks but isn't fully wrapped, strip them
                if (response.message.includes("`")) {
                    aiMessage.content = response.message.replace(/`/g, "");
                }
            }

            const finalMessages = [...updatedMessages, aiMessage];
            setMessages(finalMessages);
            updateApplet.mutate({
                id,
                data: { messages: finalMessages },
            });
        } catch (error) {
            console.error("Error calling AI endpoint:", error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleRefreshSuggestions = () => {
        suggestionsMutation.mutate(undefined, {
            onSuccess: (data) => {
                updateApplet.mutate({
                    id,
                    data: {
                        suggestions: data.map((suggestion) => ({
                            name: suggestion.name,
                            uxDescription: suggestion.ux_description,
                        })),
                    },
                });
            },
        });
    };

    // Handler to publish a version
    const handlePublishVersion = (versionIdx) => {
        updateApplet.mutate(
            {
                id,
                data: { publishedVersionIndex: versionIdx },
            },
            {
                onSuccess: () => {
                    setPublishedVersionIndex(versionIdx);
                },
            },
        );
    };

    return (
        <div className="flex flex-col h-full overflow-auto">
            {/* Header with instructions */}
            {/* {messages && messages.length === 0 && (
                <div className="bg-gray-50 border-b p-4 mb-4">
                    <p className="text-gray-600 mb-2">
                        This section allows you to generate a UI for this
                        workspace. Describe your desired UI in natural language,
                        and see the results appear in real-time. The UI will
                        have access to prompts defined in this workspace.
                    </p>
                </div>
            )} */}

            <div className="flex justify-between gap-4 h-full overflow-auto bg-gray-100 p-4">
                {htmlVersions.length > 0 && (
                    <div className="flex flex-col grow overflow-auto">
                        <Tabs
                            defaultValue="preview"
                            className="flex flex-col grow overflow-auto"
                        >
                            {htmlVersions.length > 0 && (
                                <div className="flex justify-between items-center mb-2">
                                    <div className="flex items-center gap-2">
                                        <button
                                            className={cn(
                                                "lb-outline-secondary",
                                                "bg-white",
                                            )}
                                            onClick={() =>
                                                setActiveVersionIndex((prev) =>
                                                    Math.max(0, prev - 1),
                                                )
                                            }
                                            disabled={activeVersionIndex <= 0}
                                        >
                                            {direction === "rtl" ? (
                                                <ArrowRightIcon className="w-4 h-4" />
                                            ) : (
                                                <ArrowLeftIcon className="w-4 h-4" />
                                            )}
                                        </button>
                                        <button
                                            className={cn(
                                                "lb-outline-secondary ",
                                                "bg-white",
                                            )}
                                            onClick={() =>
                                                setActiveVersionIndex((prev) =>
                                                    Math.min(
                                                        htmlVersions.length - 1,
                                                        prev + 1,
                                                    ),
                                                )
                                            }
                                            disabled={
                                                activeVersionIndex >=
                                                htmlVersions.length - 1
                                            }
                                        >
                                            {direction === "rtl" ? (
                                                <ArrowLeftIcon className="w-4 h-4" />
                                            ) : (
                                                <ArrowRightIcon className="w-4 h-4" />
                                            )}
                                        </button>
                                        <span className="text-sm text-gray-600">
                                            Version {activeVersionIndex + 1} of{" "}
                                            {htmlVersions.length}
                                        </span>
                                        {publishedVersionIndex !== null &&
                                            (activeVersionIndex ===
                                            publishedVersionIndex ? (
                                                <>
                                                    <span
                                                        className="ml-2 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500 text-white shadow-sm border border-emerald-600"
                                                        style={{
                                                            letterSpacing:
                                                                "0.03em",
                                                        }}
                                                    >
                                                        Published
                                                    </span>
                                                    <button
                                                        className="ml-2 border border-red-300 text-red-600 bg-white text-xs px-3 py-1 rounded-full font-semibold hover:bg-red-50 hover:border-red-400 transition focus:ring-2 focus:ring-red-200 focus:outline-none shadow-sm"
                                                        onClick={() => {
                                                            updateApplet.mutate(
                                                                {
                                                                    id,
                                                                    data: {
                                                                        publishedVersionIndex:
                                                                            null,
                                                                    },
                                                                },
                                                                {
                                                                    onSuccess:
                                                                        () =>
                                                                            setPublishedVersionIndex(
                                                                                null,
                                                                            ),
                                                                },
                                                            );
                                                        }}
                                                        disabled={
                                                            updateApplet.isPending
                                                        }
                                                        type="button"
                                                    >
                                                        Unpublish
                                                    </button>
                                                </>
                                            ) : (
                                                <button
                                                    className="ml-2 px-3 py-1 rounded-full text-xs font-bold bg-gray-100 text-gray-600 border border-gray-300 hover:bg-gray-200 transition shadow-sm"
                                                    onClick={() =>
                                                        setActiveVersionIndex(
                                                            publishedVersionIndex,
                                                        )
                                                    }
                                                    title={`Go to published version (v${publishedVersionIndex + 1})`}
                                                    type="button"
                                                >
                                                    Published: v
                                                    {publishedVersionIndex + 1}
                                                </button>
                                            ))}
                                        {activeVersionIndex !==
                                            publishedVersionIndex && (
                                            <button
                                                className="ml-2 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white px-4 py-1.5 rounded-full text-xs font-bold shadow-md hover:from-emerald-600 hover:to-emerald-700 transition focus:ring-2 focus:ring-emerald-200 focus:outline-none"
                                                onClick={() =>
                                                    handlePublishVersion(
                                                        activeVersionIndex,
                                                    )
                                                }
                                                disabled={
                                                    updateApplet.isPending
                                                }
                                                type="button"
                                            >
                                                {publishedVersionIndex === null
                                                    ? "Publish"
                                                    : "Publish this version instead"}
                                            </button>
                                        )}
                                        <button
                                            className="ml-2 lb-outline-secondary bg-white"
                                            onClick={() => {
                                                if (
                                                    window.confirm(
                                                        "Are you sure you want to delete this version?",
                                                    )
                                                ) {
                                                    setHtmlVersions((prev) => {
                                                        const newVersions =
                                                            prev.filter(
                                                                (_, index) =>
                                                                    index !==
                                                                    activeVersionIndex,
                                                            );
                                                        updateApplet.mutate({
                                                            id,
                                                            data: {
                                                                htmlVersions:
                                                                    newVersions,
                                                            },
                                                        });
                                                        setPreviewHtml(
                                                            newVersions[
                                                                newVersions.length -
                                                                    1
                                                            ],
                                                        );
                                                        setActiveVersionIndex(
                                                            Math.max(
                                                                0,
                                                                activeVersionIndex -
                                                                    1,
                                                            ),
                                                        );
                                                        return newVersions;
                                                    });
                                                }
                                            }}
                                        >
                                            <TrashIcon className="w-4 h-4" />
                                        </button>
                                    </div>
                                    <TabsList>
                                        <TabsTrigger value="preview">
                                            Preview
                                        </TabsTrigger>
                                        <TabsTrigger value="code">
                                            Code
                                        </TabsTrigger>
                                    </TabsList>
                                </div>
                            )}
                            {htmlVersions.length > 0 ? (
                                <div className="border rounded-md shadow-md bg-white mb-4 grow overflow-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent hover:scrollbar-thumb-gray-400">
                                    <div className="flex flex-col h-full">
                                        <div className="flex-1 p-4">
                                            <TabsContent
                                                value="preview"
                                                className="h-full m-0"
                                            >
                                                <iframe
                                                    srcDoc={
                                                        htmlVersions[
                                                            activeVersionIndex
                                                        ]
                                                    }
                                                    className="w-full h-full border-0"
                                                    sandbox="allow-scripts allow-same-origin"
                                                    title="Preview"
                                                />
                                            </TabsContent>
                                            <TabsContent
                                                value="code"
                                                className="h-full m-0"
                                            >
                                                <HtmlEditor
                                                    value={
                                                        htmlVersions[
                                                            activeVersionIndex
                                                        ]
                                                    }
                                                    onChange={(e) => {
                                                        const newVersions = [
                                                            ...htmlVersions,
                                                        ];
                                                        newVersions[
                                                            activeVersionIndex
                                                        ] = e.target.value;
                                                        setHtmlVersions(
                                                            newVersions,
                                                        );
                                                        setPreviewHtml(
                                                            e.target.value,
                                                        );
                                                    }}
                                                />
                                            </TabsContent>
                                        </div>
                                    </div>
                                </div>
                            ) : null}
                        </Tabs>
                    </div>
                )}

                <div
                    className={cn(
                        "flex flex-col",
                        htmlVersions.length > 0 ? "w-80" : "w-full",
                    )}
                >
                    {/* Model selector and Clear button in one line */}
                    <div className="mb-4 flex items-center justify-between gap-4">
                        <div className="flex items-center gap-2 flex-1">
                            <div className="w-48">
                                <LLMSelector
                                    defaultModelIdentifier={"o3mini"}
                                    value={selectedLLM}
                                    onChange={setSelectedLLM}
                                />
                            </div>
                        </div>
                        {messages && messages.length > 0 && (
                            <button
                                className="lb-outline-secondary lb-sm"
                                onClick={() => {
                                    if (
                                        window.confirm(
                                            "Are you sure you want to clear the chat?",
                                        )
                                    ) {
                                        setMessages([]);
                                        updateApplet.mutate({
                                            id,
                                            data: { messages: [] },
                                        });
                                    }
                                }}
                            >
                                Clear chat
                            </button>
                        )}
                    </div>

                    {messages && messages.length > 0 ? (
                        <div className="flex-1 overflow-auto border rounded-md p-4 bg-white scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent hover:scrollbar-thumb-gray-400">
                            {messages.map((message, index) => (
                                <div
                                    key={index}
                                    className={`mb-4 ${
                                        message.role === "user"
                                            ? "flex justify-end"
                                            : "flex justify-start"
                                    }`}
                                >
                                    <div
                                        className={`max-w-[80%] rounded-md p-3 ${
                                            message.role === "user"
                                                ? "bg-sky-100 text-sky-900"
                                                : "bg-gray-100 text-gray-900"
                                        } ${message.content === "HTML code generated. Check the preview pane →" ? "cursor-pointer hover:bg-gray-200" : ""}`}
                                        onClick={() => {
                                            if (
                                                message.content ===
                                                "HTML code generated. Check the preview pane →"
                                            ) {
                                                // Find the corresponding HTML version
                                                // Each HTML message corresponds to a version, so we can count backwards
                                                let htmlMessageCount = 0;
                                                for (
                                                    let i = messages.length - 1;
                                                    i >= 0;
                                                    i--
                                                ) {
                                                    if (
                                                        messages[i].content ===
                                                        "HTML code generated. Check the preview pane →"
                                                    ) {
                                                        if (i === index) {
                                                            setActiveVersionIndex(
                                                                htmlVersions.length -
                                                                    1 -
                                                                    htmlMessageCount,
                                                            );
                                                            break;
                                                        }
                                                        htmlMessageCount++;
                                                    }
                                                }
                                            }
                                        }}
                                    >
                                        <div className="text-xs text-gray-600 mb-1 capitalize">
                                            {message.role === "user"
                                                ? "You"
                                                : "Assistant"}
                                        </div>
                                        <ReactMarkdown
                                            className="prose dark:prose-invert text-sm break-words"
                                            components={{
                                                p: ({ children }) => (
                                                    <p className="m-0">
                                                        {children}
                                                    </p>
                                                ),
                                            }}
                                        >
                                            {message.content}
                                        </ReactMarkdown>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : null}

                    {/* Suggestions section */}
                    {selectedLLM && !messages.length && (
                        <div className="mb-4  bg-white rounded-md p-3 border grow">
                            <div className="flex justify-between items-center mb-2">
                                {appletQuery.data?.suggestions?.length > 0 && (
                                    <p className="text-sm text-gray-600 font-semibold">
                                        Suggested prompts:
                                    </p>
                                )}
                                <button
                                    onClick={handleRefreshSuggestions}
                                    disabled={suggestionsMutation.isPending}
                                    className="p-1 hover:bg-gray-100 rounded-full text-gray-500 hover:text-gray-700 disabled:opacity-50 flex gap-2 items-center"
                                    title="Refresh suggestions"
                                >
                                    {suggestionsMutation.isPending && (
                                        <span className="ps-2 text-sm">
                                            Loading suggestions...
                                        </span>
                                    )}
                                    <RiRefreshLine
                                        className={`w-4 h-4 ${suggestionsMutation.isPending ? "animate-spin" : ""}`}
                                    />
                                </button>
                            </div>
                            {appletQuery.data?.suggestions?.length > 0 && (
                                <div className="flex gap-2 overflow-auto">
                                    {appletQuery.data.suggestions.map(
                                        (suggestion, index) => (
                                            <button
                                                key={index}
                                                onClick={() =>
                                                    setInputMessage(
                                                        suggestion.uxDescription,
                                                    )
                                                }
                                                className="text-left p-2 bg-gray-100 rounded-md text-sm text-gray-700 hover:bg-gray-200 w-96 shrink-0 flex items-start"
                                            >
                                                <div>
                                                    <p className="font-bold">
                                                        {suggestion.name}
                                                    </p>
                                                    <pre className="max-h-40 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100 hover:scrollbar-thumb-gray-400 font-sans whitespace-pre-wrap text-sm text-gray-500">
                                                        {
                                                            suggestion.uxDescription
                                                        }
                                                    </pre>
                                                </div>
                                            </button>
                                        ),
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Chat input section styled like MessageInput.js */}
                    <div className="rounded-md border dark:border-zinc-200 mt-3">
                        <form className="flex items-center rounded-md dark:bg-zinc-100">
                            <div className="relative grow">
                                <div className="flex items-center">
                                    <TextareaAutosize
                                        className="w-full border-0 outline-none focus:shadow-none text-sm focus:ring-0 py-3 resize-none dark:bg-zinc-100 px-3 rounded-s max-h-24 overflow-y-auto"
                                        rows={1}
                                        value={inputMessage}
                                        onChange={(e) =>
                                            setInputMessage(e.target.value)
                                        }
                                        placeholder={
                                            messages && messages.length > 0
                                                ? "Type your message here..."
                                                : "Describe your desired UI in natural language..."
                                        }
                                        onKeyDown={(e) => {
                                            if (
                                                e.key === "Enter" &&
                                                !e.shiftKey
                                            ) {
                                                e.preventDefault();
                                                handleSendMessage();
                                            }
                                        }}
                                        autoComplete="on"
                                        autoCapitalize="sentences"
                                        autoCorrect="on"
                                        spellCheck="true"
                                        inputMode="text"
                                        disabled={isLoading}
                                    />
                                </div>
                            </div>
                            <div className="px-3 bg-white self-stretch flex items-center rounded-e">
                                <div>
                                    <button
                                        type="submit"
                                        disabled={
                                            !inputMessage.trim() || isLoading
                                        }
                                        onClick={handleSendMessage}
                                        className="text-base rtl:rotate-180 text-emerald-500 hover:text-emerald-600 disabled:text-gray-300 active:text-gray-800 dark:bg-zinc-100 flex items-center justify-center"
                                    >
                                        {isLoading ? (
                                            <div className="w-4 h-4 border-2 border-sky-600 border-t-transparent rounded-full animate-spin" />
                                        ) : (
                                            <RiSendPlane2Fill />
                                        )}
                                    </button>
                                </div>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
}

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
