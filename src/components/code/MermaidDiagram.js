import React, { useEffect, useRef, useContext, useMemo, useState } from "react";
import mermaid from "mermaid";
import { ThemeContext } from "../../contexts/ThemeProvider";

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
    const containerRef = useRef(null);
    const [isRendering, setIsRendering] = useState(false);

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
            if (!containerRef.current || !code) return;

            // Prevent concurrent renders
            if (renderingInProgress) return;
            renderingInProgress = true;

            try {
                setIsRendering(true);
                
                // Clear container before rendering to avoid showing stale content
                if (containerRef.current) {
                    containerRef.current.innerHTML = "";
                }

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

                if (isMounted && containerRef.current) {
                    containerRef.current.innerHTML = svg;

                    // Notify parent that the diagram has loaded
                    if (onLoad) {
                        onLoad();
                    }
                }
            } catch (error) {
                console.error("Error rendering mermaid diagram:", error);
                if (isMounted && containerRef.current) {
                    containerRef.current.innerHTML = `
                        <div class="bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden">
                            <div class="flex items-start gap-2 px-4 py-2 bg-red-50 dark:bg-red-900/20 border-b border-red-100 dark:border-red-800">
                                <svg class="w-5 h-5 text-red-500 dark:text-red-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                                </svg>
                                <span class="text-sm text-red-600 dark:text-red-400 font-mono whitespace-pre">${error.message}</span>
                            </div>
                            <div class="flex font-mono text-sm">
                                <pre class="text-gray-400 dark:text-gray-500 pr-2 pl-1 select-none border-r border-gray-200 dark:border-gray-700 min-w-[2.5rem] text-right">${code
                                    .split("\n")
                                    .map((_, i) => i + 1)
                                    .join("\n")}</pre>
                                <pre class="text-gray-700 dark:text-gray-300 overflow-x-auto pl-2 whitespace-pre">${code}</pre>
                            </div>
                        </div>`;
                }
            } finally {
                renderingInProgress = false;
                if (isMounted) {
                    setIsRendering(false);
                }
            }
        };

        renderDiagram();

        return () => {
            isMounted = false;
            renderingInProgress = false;
            setIsRendering(false);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [code, themeConfig, theme]);

    return (
        <div
            ref={containerRef}
            className="mermaid-diagram my-4 p-4 rounded-lg shadow-sm"
            style={{
                background: theme === "dark" ? "#222" : "#fff",
                maxWidth: "90%",
                paddingLeft: "1rem",
                overflow: "visible",
            }}
        />
    );
};

export default MermaidDiagram;
