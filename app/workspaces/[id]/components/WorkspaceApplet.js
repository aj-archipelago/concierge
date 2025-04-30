"use client";
import { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import LLMSelector from "../../components/LLMSelector";
import { RiSendPlane2Fill, RiRefreshLine } from "react-icons/ri";
import TextareaAutosize from "react-textarea-autosize";
import { useParams } from "next/navigation";
import {
    useWorkspaceSuggestions,
    useWorkspaceApplet,
    useUpdateWorkspaceApplet,
    useWorkspaceChat,
} from "../../../queries/workspaces";

export default function WorkspaceApplet() {
    const { id } = useParams();
    const [selectedLLM, setSelectedLLM] = useState("");
    const [messages, setMessages] = useState([]);
    const [inputMessage, setInputMessage] = useState("");
    const [previewHtml, setPreviewHtml] = useState(null);
    const [htmlVersions, setHtmlVersions] = useState([]);
    const [activeVersionIndex, setActiveVersionIndex] = useState(-1);
    const [isLoading, setIsLoading] = useState(false);
    const suggestionsMutation = useWorkspaceSuggestions(id, selectedLLM);
    const appletQuery = useWorkspaceApplet(id);
    const updateApplet = useUpdateWorkspaceApplet();
    const chatMutation = useWorkspaceChat(id);

    useEffect(() => {
        if (selectedLLM && !appletQuery.data?.suggestions?.length && !appletQuery.isLoading) {
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
                setHtmlVersions(appletQuery.data.htmlVersions.map(v => v.content));
                setActiveVersionIndex(appletQuery.data.htmlVersions.length - 1);
                setPreviewHtml(appletQuery.data.htmlVersions[appletQuery.data.htmlVersions.length - 1].content);
            }
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
                currentHtml: previewHtml
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
                // Remove backticks and potential language specifier from start and end
                const htmlCode = response.message.replace(/^`+\s*html?\s*|`+$/g, '');
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
                        messages: updatedMessages
                    },
                });

                aiMessage.content = "HTML code generated. Check the preview pane →";
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

    return (
        <div className="flex flex-col h-full overflow-auto">
            {/* Header with instructions */}
            {messages && messages.length === 0 && (
                <div className="bg-gray-50 border-b p-4 mb-4">
                    <p className="text-gray-600 mb-2">
                        This section allows you to generate a UI for this
                        workspace. Describe your desired UI in natural language,
                        and see the results appear in real-time. The UI will
                        have access to prompts defined in this workspace.
                    </p>
                    <div className="bg-sky-50 border border-sky-200 rounded-lg p-3">
                        <h2 className="font-semibold text-sky-800 mb-1">
                            How to use
                        </h2>
                        <ul className="text-sky-700 text-sm list-disc list-inside ps-2">
                            <li>Select an AI model from the dropdown below</li>
                            <li>
                                Describe the UI you want to create in natural
                                language
                            </li>
                            <li>
                                The AI will generate HTML/CSS code based on your
                                description
                            </li>
                            <li>
                                Preview the results in real-time on the right
                                panel
                            </li>
                            <li>
                                Iterate and refine your design through
                                conversation
                            </li>
                        </ul>
                    </div>
                </div>
            )}

            <div className="flex flex-1 gap-4 min-h-96 overflow-auto bg-gray-100 p-4">
                {/* Left pane - Chat Interface */}
                <div className="w-1/2 flex flex-col">
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
                                className="lb-outline-secondary"
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
                        <div className="flex-1 overflow-auto border rounded-lg p-4 bg-white scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent hover:scrollbar-thumb-gray-400">
                            {messages.map((message, index) => (
                                <div
                                    key={index}
                                    className={`mb-4 ${message.role === 'user'
                                            ? 'flex justify-end'
                                            : 'flex justify-start'
                                        }`}
                                >
                                    <div
                                        className={`max-w-[80%] rounded-lg p-3 ${message.role === 'user'
                                                ? 'bg-sky-100 text-sky-900'
                                                : 'bg-gray-100 text-gray-900'
                                            } ${message.content === "HTML code generated. Check the preview pane →" ? 'cursor-pointer hover:bg-gray-200' : ''}`}
                                        onClick={() => {
                                            if (message.content === "HTML code generated. Check the preview pane →") {
                                                // Find the corresponding HTML version
                                                // Each HTML message corresponds to a version, so we can count backwards
                                                let htmlMessageCount = 0;
                                                for (let i = messages.length - 1; i >= 0; i--) {
                                                    if (messages[i].content === "HTML code generated. Check the preview pane →") {
                                                        if (i === index) {
                                                            setActiveVersionIndex(htmlVersions.length - 1 - htmlMessageCount);
                                                            break;
                                                        }
                                                        htmlMessageCount++;
                                                    }
                                                }
                                            }
                                        }}
                                    >
                                        <div className="text-xs text-gray-600 mb-1 capitalize">
                                            {message.role === 'user' ? 'You' : 'Assistant'}
                                        </div>
                                        <ReactMarkdown
                                            className="prose dark:prose-invert text-sm break-words"
                                            components={{
                                                p: ({ children }) => <p className="m-0">{children}</p>
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
                        <div className="mb-4">
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
                                        disabled={!inputMessage.trim() || isLoading}
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

                {/* Right pane - HTML Preview */}
                <div className="w-1/2 flex flex-col">
                    {htmlVersions.length > 0 && (
                        <div className="flex justify-between items-center mb-4">
                            <button
                                onClick={() => setActiveVersionIndex(prev => Math.max(0, prev - 1))}
                                disabled={activeVersionIndex <= 0}
                                className="p-2 rounded hover:bg-gray-100 disabled:opacity-50"
                            >
                                ← Previous Version
                            </button>
                            <span className="text-sm text-gray-600">
                                Version {activeVersionIndex + 1} of {htmlVersions.length}
                            </span>
                            <button
                                onClick={() => setActiveVersionIndex(prev => Math.min(htmlVersions.length - 1, prev + 1))}
                                disabled={activeVersionIndex >= htmlVersions.length - 1}
                                className="p-2 rounded hover:bg-gray-100 disabled:opacity-50"
                            >
                                Next Version →
                            </button>
                        </div>
                    )}
                    <div className="border rounded-lg shadow-md bg-white mb-4 grow overflow-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent hover:scrollbar-thumb-gray-400">
                        {htmlVersions.length > 0 ? (
                            <div className="flex flex-col h-full">

                                <div className="flex-1 p-4">
                                    <div
                                        dangerouslySetInnerHTML={{
                                            __html: htmlVersions[activeVersionIndex],
                                        }}
                                    />
                                </div>
                            </div>
                        ) : (
                            <div className="text-gray-500">
                                HTML preview will appear here...
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
