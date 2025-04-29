"use client";
import { useState, useEffect } from "react";
import LLMSelector from "../../components/LLMSelector";
import { RiSendPlane2Fill, RiRefreshLine } from "react-icons/ri";
import TextareaAutosize from "react-textarea-autosize";
import { useParams } from "next/navigation";
import { useWorkspaceSuggestions } from "../../../queries/workspaces";

export default function WorkspaceUI() {
    const { id } = useParams();
    const [selectedLLM, setSelectedLLM] = useState("");
    const [messages, setMessages] = useState([]);
    const [inputMessage, setInputMessage] = useState("");
    const suggestionsMutation = useWorkspaceSuggestions(id, selectedLLM);

    useEffect(() => {
        if (selectedLLM) {
            suggestionsMutation.mutate();
        }
    }, [selectedLLM]);

    const handleSendMessage = () => {
        if (!inputMessage.trim()) return;

        const newMessage = {
            content: inputMessage,
            role: "user",
            timestamp: new Date().toISOString(),
        };

        setMessages((prev) => [...prev, newMessage]);
        setInputMessage("");
    };

    return (
        <div className="flex flex-col h-screen">
            {/* Header with instructions */}
            <div className="bg-gray-50 border-b p-4 mb-4">
                <p className="text-gray-600 mb-2">
                    This section allows you to generate a UI for this workspace.
                    Describe your desired UI in natural language, and see the
                    results appear in real-time. The UI will have access to
                    prompts defined in this workspace.
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
                            Preview the results in real-time on the right panel
                        </li>
                        <li>
                            Iterate and refine your design through conversation
                        </li>
                    </ul>
                </div>
            </div>

            <div className="flex flex-1 gap-4 px-4">
                {/* Left pane - Chat Interface */}
                <div className="w-1/2 flex flex-col">
                    {/* Model selector and Clear button in one line */}
                    <div className="mb-4 flex items-center justify-between gap-4">
                        <div className="flex items-center gap-2 flex-1">
                            <div className="w-48">
                                <LLMSelector
                                    value={selectedLLM}
                                    onChange={setSelectedLLM}
                                />
                            </div>
                        </div>
                        {messages && messages.length > 0 && (
                            <button
                                className="lb-outline-secondary"
                                onClick={() => setMessages([])}
                            >
                                Clear
                            </button>
                        )}
                    </div>

                    {messages && messages.length > 0 ? (
                        <div className="flex-1 overflow-auto mb-4 border rounded-lg p-4">
                            {messages.map((message, index) => (
                                <div key={index} className="mb-2">
                                    <span className="font-bold">
                                        {message.role}:{" "}
                                    </span>
                                    {message.content}
                                </div>
                            ))}
                        </div>
                    ) : null}

                    {/* Suggestions section */}
                    {selectedLLM && (
                        <div className="mb-4">
                            <div className="flex justify-between items-center mb-2">
                                {suggestionsMutation.data?.length > 0 && (
                                    <p className="text-sm text-gray-600 font-semibold">
                                        Suggested prompts:
                                    </p>
                                )}
                                <button
                                    onClick={() => suggestionsMutation.mutate()}
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
                            {suggestionsMutation.data?.length > 0 &&
                                !messages.length && (
                                    <div className="flex gap-2 overflow-auto">
                                        {suggestionsMutation.data.map(
                                            (suggestion, index) => (
                                                <button
                                                    key={index}
                                                    onClick={() =>
                                                        setInputMessage(
                                                            suggestion.ux_description,
                                                        )
                                                    }
                                                    className="text-left p-2 bg-gray-100 rounded-md text-sm text-gray-700 hover:bg-gray-200 w-96 shrink-0 flex items-start"
                                                >
                                                    <div>
                                                        <p className="font-bold">
                                                            {suggestion.name}
                                                        </p>
                                                        <pre className=" max-h-40 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-400 scrollbar-track-gray-100 font-sans whitespace-pre-wrap text-sm text-gray-500">
                                                            {
                                                                suggestion.ux_description
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
                                    />
                                </div>
                            </div>
                            <div className="pe-4 ps-3 dark:bg-zinc-100 self-stretch flex rounded-e">
                                <div className="pt-4">
                                    <button
                                        type="submit"
                                        disabled={!inputMessage.trim()}
                                        onClick={handleSendMessage}
                                        className="text-base rtl:rotate-180 text-emerald-600 hover:text-emerald-600 disabled:text-gray-300 active:text-gray-800 dark:bg-zinc-100"
                                    >
                                        <RiSendPlane2Fill />
                                    </button>
                                </div>
                            </div>
                        </form>
                    </div>
                </div>

                {/* Right pane - HTML Preview */}
                <div className="w-1/2">
                    <div className="h-full border rounded-lg p-4">
                        <div className="text-gray-500">
                            HTML preview will appear here...
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
