import React, { useEffect, useContext, useMemo, useState } from "react";
import mermaid from "mermaid";
import { ThemeContext } from "../../contexts/ThemeProvider";
import { AlertCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import CopyButton from "../CopyButton";
import MermaidPlaceholder from "./MermaidPlaceholder";
import SVGViewer from "../common/SVGViewer";

const lightThemeVars = {
    primaryColor: "#1a73e8",
    primaryTextColor: "#000",
    primaryBorderColor: "#1a73e8",
    lineColor: "#1a73e8",
    secondaryColor: "#f0f0f0",
    tertiaryColor: "#f0f0f0",
    background: "#fff",
};

const darkThemeVars = {
    primaryColor: "#90cdf4",
    primaryTextColor: "#fff",
    primaryBorderColor: "#90cdf4",
    lineColor: "#90cdf4",
    secondaryColor: "#222",
    tertiaryColor: "#333",
    background: "#222",
};

const MermaidDiagram = ({ code, onLoad }) => {
    const { theme } = useContext(ThemeContext);
    const { t } = useTranslation();
    const [renderedSvg, setRenderedSvg] = useState(null);
    const [error, setError] = useState(null);
    const [isLoading, setIsLoading] = useState(true);

    // Memoize the theme configuration
    const themeConfig = useMemo(
        () => ({
            theme: theme === "dark" ? "dark" : "default",
            themeVariables: theme === "dark" ? darkThemeVars : lightThemeVars,
        }),
        [theme],
    );

    useEffect(() => {
        let isMounted = true;
        let renderingInProgress = false;

        const renderDiagram = async () => {
            if (!code) return;

            // Prevent concurrent renders
            if (renderingInProgress) return;
            renderingInProgress = true;

            // Reset state for new render
            if (isMounted) {
                setIsLoading(true);
                setRenderedSvg(null);
                setError(null);
            }

            try {
                const id = `mermaid-${Math.random().toString(36).substr(2, 9)}`;

                // Update mermaid theme configuration
                mermaid.initialize({
                    startOnLoad: true,
                    securityLevel: "loose",
                    suppressErrorRendering: true,
                    logLevel: "error",
                    flowchart: {
                        htmlLabels: true,
                        curve: "basis",
                    },
                    sequence: {
                        diagramMarginX: 50,
                        diagramMarginY: 10,
                        actorMargin: 50,
                        width: 150,
                        height: 65,
                        boxMargin: 10,
                        boxTextMargin: 5,
                        noteMargin: 10,
                        messageMargin: 35,
                    },
                    ...themeConfig,
                });

                const { svg } = await mermaid.render(id, code);

                if (isMounted) {
                    // Store the SVG string
                    setRenderedSvg(svg);
                    setError(null); // Clear any previous errors
                    setIsLoading(false);

                    // Notify parent that the diagram has loaded
                    if (onLoad) {
                        onLoad();
                    }
                }
            } catch (err) {
                console.error("Error rendering mermaid diagram:", err);
                if (isMounted) {
                    setRenderedSvg(null);
                    setIsLoading(false);
                    setError({
                        message: err.message || t("Failed to render diagram"),
                        code: code,
                    });
                }
            } finally {
                renderingInProgress = false;
            }
        };

        renderDiagram();

        return () => {
            isMounted = false;
            renderingInProgress = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [code, themeConfig, theme, t]);

    // Prepare error text for copying
    const errorText = error
        ? `${t("Mermaid Diagram Error")}:\n${error.message}\n\n${t("Source Code")}:\n${error.code}`
        : "";

    // Show loading state
    if (isLoading && !error) {
        return (
            <MermaidPlaceholder
                spinnerKey={`mermaid-loading-${code?.substring(0, 20)}`}
            />
        );
    }

    return (
        <>
            {error ? (
                <div className="mermaid-placeholder my-3 px-2 sm:px-3 py-2 rounded-md border border-red-200 dark:border-red-800/50 bg-red-50/50 dark:bg-red-900/10 flex items-center gap-2 text-xs sm:text-sm text-gray-500 dark:text-gray-400 relative group">
                    <div className="w-4 h-4 text-red-500 dark:text-red-400 flex-shrink-0">
                        <AlertCircle className="w-4 h-4" />
                    </div>
                    <span className="font-medium flex-1">
                        {t("Mermaid diagram failed to render")}
                    </span>
                    <CopyButton
                        item={errorText}
                        className="absolute top-1 end-1 opacity-0 group-hover:opacity-60 hover:opacity-100 transition-opacity pointer-events-auto"
                    />
                </div>
            ) : (
                <div
                    className="mermaid-diagram-container relative group my-3 rounded-lg shadow-sm overflow-hidden"
                    style={{
                        background: theme === "dark" ? "#222" : "#fff",
                        width: "100%",
                        paddingLeft: "0.75rem",
                    }}
                >
                    {renderedSvg && (
                        <SVGViewer
                            svgContent={renderedSvg}
                            className=""
                            wrapperClassName=""
                        />
                    )}
                </div>
            )}
        </>
    );
};

export default MermaidDiagram;
