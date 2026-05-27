"use client";

import React, { useMemo, useState } from "react";
import { HighlightJS } from "highlight.js";
import CopyButton from "../CopyButton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

const PANEL_CLASS_NAME =
    "mt-0 [grid-area:1/1] data-[state=inactive]:invisible data-[state=inactive]:pointer-events-none";

function highlightCode(code, language) {
    if (language && HighlightJS.getLanguage(language)) {
        return HighlightJS.highlight(code, { language }).value;
    }

    return HighlightJS.highlightAuto(code).value;
}

const TabbedPreviewCodeBlock = ({
    code,
    highlightLanguage,
    previewSurfaceClassName,
    previewContentClassName,
    renderPreview,
}) => {
    const [activeTab, setActiveTab] = useState("code");
    const [hasVisitedPreview, setHasVisitedPreview] = useState(false);
    const trimmedCode = code?.trim() || "";
    const shouldPersistPreview = hasVisitedPreview || activeTab === "preview";
    const highlightedCode = useMemo(
        () => highlightCode(trimmedCode, highlightLanguage),
        [trimmedCode, highlightLanguage],
    );

    const handleValueChange = (nextTab) => {
        if (nextTab === "preview") {
            setHasVisitedPreview(true);
        }
        setActiveTab(nextTab);
    };

    return (
        <div className="py-3 mobile-overflow-safe">
            <div style={{ position: "relative" }}>
                <CopyButton item={code} />
            </div>
            <Tabs
                value={activeTab}
                onValueChange={handleValueChange}
                className="w-full"
            >
                <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="code">Code</TabsTrigger>
                    <TabsTrigger value="preview">Preview</TabsTrigger>
                </TabsList>
                <div className="mt-2 grid">
                    <TabsContent
                        value="code"
                        forceMount
                        className={PANEL_CLASS_NAME}
                    >
                        <div
                            className="code-block mobile-overflow-safe"
                            data-testid="tabbed-code-block-code-surface"
                        >
                            <pre className="mobile-overflow-safe">
                                <code
                                    className="hljs mobile-text-wrap"
                                    dangerouslySetInnerHTML={{
                                        __html: highlightedCode,
                                    }}
                                />
                            </pre>
                        </div>
                    </TabsContent>
                    <TabsContent
                        value="preview"
                        forceMount={shouldPersistPreview}
                        className={PANEL_CLASS_NAME}
                    >
                        {shouldPersistPreview ? (
                            <div
                                className={cn(
                                    "code-block-preview-surface border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-900 min-h-[100px] mobile-overflow-safe",
                                    previewSurfaceClassName,
                                )}
                                data-testid="tabbed-code-block-preview-surface"
                            >
                                <div
                                    className={cn(
                                        "code-block-preview-content",
                                        previewContentClassName,
                                    )}
                                >
                                    {renderPreview(trimmedCode)}
                                </div>
                            </div>
                        ) : null}
                    </TabsContent>
                </div>
            </Tabs>
        </div>
    );
};

export default TabbedPreviewCodeBlock;
