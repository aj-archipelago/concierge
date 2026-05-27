"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

/**
 * JSON Viewer Component with expand/collapse functionality
 */
export function JsonViewer({ data, level = 0 }) {
    const [isExpanded, setIsExpanded] = useState(level < 2); // Auto-expand first 2 levels

    if (data === null) {
        return (
            <span className="text-purple-600 dark:text-purple-400">null</span>
        );
    }

    if (data === undefined) {
        return (
            <span className="text-gray-400 dark:text-gray-500">undefined</span>
        );
    }

    if (typeof data === "boolean") {
        return (
            <span className="text-blue-600 dark:text-blue-400">
                {String(data)}
            </span>
        );
    }

    if (typeof data === "number") {
        return (
            <span className="text-green-600 dark:text-green-400">
                {String(data)}
            </span>
        );
    }

    if (typeof data === "string") {
        const isLongString = data.length > 100;
        const displayValue = isLongString
            ? data.substring(0, 100) + "..."
            : data;
        return (
            <span className="text-orange-600 dark:text-orange-400">
                "{displayValue}"
                {isLongString && (
                    <span className="text-gray-500 dark:text-gray-400 text-xs ml-1">
                        ({data.length} chars)
                    </span>
                )}
            </span>
        );
    }

    if (Array.isArray(data)) {
        if (data.length === 0) {
            return <span className="text-gray-500 dark:text-gray-400">[]</span>;
        }

        return (
            <div className="ml-4">
                <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="flex items-center gap-1 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
                >
                    {isExpanded ? (
                        <ChevronDown className="h-3 w-3" />
                    ) : (
                        <ChevronRight className="h-3 w-3" />
                    )}
                    <span className="text-gray-500 dark:text-gray-400 font-medium">
                        [{data.length}]
                    </span>
                </button>
                {isExpanded && (
                    <div className="ml-4 mt-1 border-l-2 border-gray-300 dark:border-gray-600 pl-3 space-y-0.5">
                        {data.map((item, index) => (
                            <div key={index} className="py-0.5">
                                <span className="text-gray-500 dark:text-gray-400 text-xs mr-2 font-medium">
                                    {index}:
                                </span>
                                <JsonViewer data={item} level={level + 1} />
                                {index < data.length - 1 && (
                                    <span className="text-gray-400">,</span>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        );
    }

    if (typeof data === "object") {
        const keys = Object.keys(data);
        if (keys.length === 0) {
            return (
                <span className="text-gray-500 dark:text-gray-400">{`{}`}</span>
            );
        }

        return (
            <div className="ml-4">
                <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="flex items-center gap-1 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
                >
                    {isExpanded ? (
                        <ChevronDown className="h-3 w-3" />
                    ) : (
                        <ChevronRight className="h-3 w-3" />
                    )}
                    <span className="text-gray-500 dark:text-gray-400 font-medium">
                        {`{${keys.length} key${keys.length !== 1 ? "s" : ""}}`}
                    </span>
                </button>
                {isExpanded && (
                    <div className="ml-4 mt-1 border-l-2 border-gray-300 dark:border-gray-600 pl-3 space-y-0.5">
                        {keys.map((key, index) => (
                            <div key={key} className="py-0.5">
                                <span className="text-blue-600 dark:text-blue-400 font-medium">
                                    "{key}"
                                </span>
                                <span className="text-gray-500 dark:text-gray-400 mx-1">
                                    :
                                </span>
                                <JsonViewer
                                    data={data[key]}
                                    level={level + 1}
                                />
                                {index < keys.length - 1 && (
                                    <span className="text-gray-400">,</span>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        );
    }

    return <span>{String(data)}</span>;
}
