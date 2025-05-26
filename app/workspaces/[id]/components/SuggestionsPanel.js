"use client";
import { RiRefreshLine } from "react-icons/ri";

export default function SuggestionsPanel({
    suggestions,
    onSuggestionClick,
    onRefresh,
    isRefreshing,
}) {
    return (
        <div className="mb-4 bg-white rounded-md p-3 border grow">
            <div className="flex justify-between items-center mb-2">
                {suggestions?.length > 0 && (
                    <p className="text-sm text-gray-600 font-semibold">
                        Suggested prompts:
                    </p>
                )}
                <button
                    onClick={onRefresh}
                    disabled={isRefreshing}
                    className="p-1 hover:bg-gray-100 rounded-full text-gray-500 hover:text-gray-700 disabled:opacity-50 flex gap-2 items-center"
                    title="Refresh suggestions"
                >
                    {isRefreshing && (
                        <span className="ps-2 text-sm">
                            Loading suggestions...
                        </span>
                    )}
                    <RiRefreshLine
                        className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`}
                    />
                </button>
            </div>
            {suggestions?.length > 0 && (
                <div className="flex gap-2 overflow-auto">
                    {suggestions.map((suggestion, index) => (
                        <button
                            key={index}
                            onClick={() =>
                                onSuggestionClick(suggestion.uxDescription)
                            }
                            className="text-left p-2 bg-gray-100 rounded-md text-sm text-gray-700 hover:bg-gray-200 w-96 shrink-0 flex items-start"
                        >
                            <div>
                                <p className="font-bold">{suggestion.name}</p>
                                <pre className="max-h-40 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100 hover:scrollbar-thumb-gray-400 font-sans whitespace-pre-wrap text-sm text-gray-500">
                                    {suggestion.uxDescription}
                                </pre>
                            </div>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
