"use client";
import { cn } from "@/lib/utils";
import { LanguageContext } from "@/src/contexts/LanguageProvider";
import {
    ArrowLeftIcon,
    ArrowRightIcon,
    TrashIcon,
    Link2Icon,
    CheckIcon,
} from "lucide-react";
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
import MonacoEditor from "@monaco-editor/react";
import {
    Tooltip,
    TooltipTrigger,
    TooltipContent,
    TooltipProvider,
} from "@/components/ui/tooltip";
import { ServerContext } from "../../../../src/App";
import React from "react";

function CopyPublishedLinkButton() {
    const [copied, setCopied] = useState(false);
    const serverContext = useContext(ServerContext);
    const { id } = useParams();
    const placeholderLink = `${serverContext.serverUrl}/published/workspaces/${id}/applet`;

    const handleCopy = async (e) => {
        e.stopPropagation();
        await navigator.clipboard.writeText(placeholderLink);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
    };

    const handleOpen = (e) => {
        e.stopPropagation();
        window.open(placeholderLink, "_blank", "noopener,noreferrer");
    };

    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <span className="inline-flex">
                    <button
                        className={`flex items-center px-2 py-0.5 rounded-full border border-emerald-200 bg-white hover:bg-emerald-50 transition shadow-sm ${copied ? "border-emerald-400 bg-emerald-50" : ""}`}
                        type="button"
                        aria-label="Copy or open published link"
                        tabIndex={0}
                    >
                        <span
                            className={`p-1 rounded-full transition cursor-pointer ${copied ? "bg-emerald-100" : "hover:bg-emerald-100"}`}
                            onClick={handleCopy}
                            title="Copy link"
                        >
                            {copied ? (
                                <CheckIcon className="w-4 h-4 text-emerald-700" />
                            ) : (
                                <Link2Icon className="w-4 h-4 text-emerald-700" />
                            )}
                        </span>
                        <span
                            className="px-1 py-1 rounded-full text-xs font-bold text-emerald-700 underline hover:text-emerald-900 transition cursor-pointer"
                            onClick={handleOpen}
                            title="Open link"
                        >
                            {copied ? "Copied!" : "Open"}
                        </span>
                    </button>
                </span>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={10}>
                {copied ? "Copied!" : placeholderLink}
            </TooltipContent>
        </Tooltip>
    );
}

function renderWithColorPreviews(text) {
    const hexColorRegex = /#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})(?![0-9a-fA-F])/g;
    const parts = [];
    let lastIndex = 0;
    let match;

    while ((match = hexColorRegex.exec(text)) !== null) {
        const color = match[0];
        if (match.index > lastIndex) {
            parts.push(text.slice(lastIndex, match.index));
        }
        parts.push(
            <React.Fragment key={match.index}>
                <span style={{ fontFamily: "monospace" }}>{color}</span>
                <span
                    style={{
                        display: "inline-block",
                        width: "1em",
                        height: "1em",
                        background: color,
                        border: "1px solid #ccc",
                        marginLeft: 4,
                        marginRight: 4,
                        verticalAlign: "middle",
                    }}
                    title={color}
                />
            </React.Fragment>
        );
        lastIndex = match.index + color.length;
    }
    if (lastIndex < text.length) {
        parts.push(text.slice(lastIndex));
    }
    return parts;
}

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
    const [allMessages, setAllMessages] = useState([]);

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
        if (appletQuery.data?.messages?.length > 0 && !allMessages?.length) {
            setAllMessages(appletQuery.data.messages || []);
            setMessages(
                getMessagesUpToVersion(
                    appletQuery.data.messages,
                    activeVersionIndex,
                ),
            );
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
    }, [appletQuery.data, allMessages?.length]);

    useEffect(() => {
        // Only update if allMessages is loaded and activeVersionIndex is valid
        if (
            allMessages &&
            allMessages.length > 0 &&
            activeVersionIndex !== -1
        ) {
            setMessages(
                getMessagesUpToVersion(allMessages, activeVersionIndex),
            );
        }
    }, [activeVersionIndex, allMessages]);

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

        try {
            // Use the currently displayed version for currentHtml
            const currentHtml = htmlVersions[activeVersionIndex] || "";

            console.log("Current HTML", currentHtml);

            const response = await chatMutation.mutateAsync({
                messages: updatedMessages,
                model: selectedLLM,
                currentHtml,
            });

            let aiMessage = {
                content: response.message,
                role: "assistant",
                timestamp: new Date().toISOString(),
            };

            let newVersions = htmlVersions; // default to current
            if (
                typeof response.message === "object" &&
                response.message !== null &&
                typeof response.message.html === "string" &&
                typeof response.message.changes === "string"
            ) {
                // Branching logic: keep up to and including the current version, then add the new one
                newVersions = [
                    ...htmlVersions.slice(0, activeVersionIndex + 1),
                    response.message.html,
                ];
                setHtmlVersions(newVersions);
                setPreviewHtml(response.message.html);
                setActiveVersionIndex(newVersions.length - 1);

                aiMessage.content = `HTML code generated. Check the preview pane →\n\n**Summary of changes:**\n${response.message.changes}`;
                aiMessage.linkToVersion = newVersions.length - 1;
            } else {
                aiMessage.content = response.message;
                if (response.message.includes("`")) {
                    aiMessage.content = response.message.replace(/`/g, "");
                }
            }

            const finalMessages = [...updatedMessages, aiMessage];
            setAllMessages(finalMessages);
            setMessages(
                getMessagesUpToVersion(finalMessages, activeVersionIndex),
            );

            updateApplet.mutate({
                id,
                data: {
                    messages: finalMessages,
                    htmlVersions: newVersions,
                },
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

    console.log("Messages", messages);

    return (
        <TooltipProvider>
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
                                                    setActiveVersionIndex(
                                                        (prev) =>
                                                            Math.max(
                                                                0,
                                                                prev - 1,
                                                            ),
                                                    )
                                                }
                                                disabled={
                                                    activeVersionIndex <= 0
                                                }
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
                                                    setActiveVersionIndex(
                                                        (prev) =>
                                                            Math.min(
                                                                htmlVersions.length -
                                                                    1,
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
                                                Version {activeVersionIndex + 1}{" "}
                                                of {htmlVersions.length}
                                            </span>
                                            {publishedVersionIndex !== null &&
                                                (activeVersionIndex ===
                                                publishedVersionIndex ? (
                                                    <>
                                                        <span
                                                            className=" px-3 py-1 rounded-full text-xs font-bold bg-emerald-500 text-white shadow-sm border border-emerald-600"
                                                            style={{
                                                                letterSpacing:
                                                                    "0.03em",
                                                            }}
                                                        >
                                                            Published
                                                        </span>
                                                        <CopyPublishedLinkButton />
                                                        <button
                                                            className=" px-3 py-1 rounded-full text-xs font-bold border border-red-300 text-red-600 bg-white hover:bg-red-50 hover:border-red-400 transition focus:ring-2 focus:ring-red-200 focus:outline-none shadow-sm"
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
                                                        className="px-3 py-1 rounded-full text-xs font-bold border border-gray-300 bg-gray-100 text-gray-600 hover:bg-gray-200 transition shadow-sm"
                                                        onClick={() =>
                                                            setActiveVersionIndex(
                                                                publishedVersionIndex,
                                                            )
                                                        }
                                                        title={`Go to published version (v${publishedVersionIndex + 1})`}
                                                        type="button"
                                                    >
                                                        Published: v
                                                        {publishedVersionIndex +
                                                            1}
                                                    </button>
                                                ))}
                                            {activeVersionIndex !==
                                                publishedVersionIndex && (
                                                <>
                                                    <button
                                                        className="px-3 py-1.5 rounded-full text-xs font-bold bg-gradient-to-r from-emerald-500 to-emerald-600 text-white shadow-md hover:from-emerald-600 hover:to-emerald-700 transition focus:ring-2 focus:ring-emerald-200 focus:outline-none"
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
                                                        {publishedVersionIndex ===
                                                        null
                                                            ? "Publish"
                                                            : "Publish this version instead"}
                                                    </button>
                                                    <button
                                                        className="px-3 py-1 rounded-full text-xs font-bold border lb-outline-secondary bg-white"
                                                        onClick={() => {
                                                            if (
                                                                window.confirm(
                                                                    "Are you sure you want to delete this version?",
                                                                )
                                                            ) {
                                                                setHtmlVersions(
                                                                    (prev) => {
                                                                        const newVersions =
                                                                            prev.filter(
                                                                                (
                                                                                    _,
                                                                                    index,
                                                                                ) =>
                                                                                    index !==
                                                                                    activeVersionIndex,
                                                                            );
                                                                        updateApplet.mutate(
                                                                            {
                                                                                id,
                                                                                data: {
                                                                                    htmlVersions:
                                                                                        newVersions,
                                                                                },
                                                                            },
                                                                        );
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
                                                                    },
                                                                );
                                                            }
                                                        }}
                                                    >
                                                        <TrashIcon className="w-4 h-4" />
                                                    </button>
                                                </>
                                            )}
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
                                                        onChange={(
                                                            value,
                                                            e,
                                                        ) => {
                                                            const newVersions =
                                                                [
                                                                    ...htmlVersions,
                                                                ];
                                                            newVersions[
                                                                activeVersionIndex
                                                            ] = value;
                                                            setHtmlVersions(
                                                                newVersions,
                                                            );
                                                            setPreviewHtml(
                                                                value,
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
                                            } ${typeof message.linkToVersion === "number" ? "cursor-pointer hover:bg-gray-200" : ""}`}
                                            onClick={() => {
                                                if (
                                                    typeof message.linkToVersion ===
                                                    "number"
                                                ) {
                                                    setActiveVersionIndex(
                                                        message.linkToVersion,
                                                    );
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
                                                            {React.Children.toArray(children).map((child, idx) =>
                                                                typeof child === "string"
                                                                    ? renderWithColorPreviews(child)
                                                                    : child
                                                            )}
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
                                    {appletQuery.data?.suggestions?.length >
                                        0 && (
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
                                                !inputMessage.trim() ||
                                                isLoading
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
        </TooltipProvider>
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

function getMessagesUpToVersion(messages, versionIndex) {
    if (!messages || versionIndex === 0) return [];
    const idx = messages.findIndex((msg) => msg.linkToVersion === versionIndex);
    if (idx === -1) return messages;
    return messages.slice(0, idx + 1);
}
