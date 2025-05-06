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

const MermaidDiagram = ({ code }) => {
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

        const renderDiagram = async () => {
            if (!containerRef.current || !code) return;
            
            // Only set isRendering if we're actually going to render
            if (isRendering) return;
            
            try {
                setIsRendering(true);
                const id = `mermaid-${Math.random().toString(36).substr(2, 9)}`;

                // Update mermaid theme configuration
                mermaid.initialize({
                    startOnLoad: true,
                    securityLevel: "loose",
                    suppressErrorRendering: true,
                    logLevel: "error",
                    flowchart: {
                        htmlLabels: true,
                        curve: "basis"
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
                        messageMargin: 35
                    },
                    ...themeConfig,
                });

                const { svg } = await mermaid.render(id, code);

                if (isMounted && containerRef.current) {
                    containerRef.current.innerHTML = svg;
                    console.log("Mermaid diagram rendered:", {
                        id,
                        code,
                        theme,
                    });
                }
            } catch (error) {
                console.error("Error rendering mermaid diagram:", error);
                if (isMounted && containerRef.current) {
                    containerRef.current.innerHTML = `
                        <div class="flex flex-col items-center p-6 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
                            <div class="text-red-600 dark:text-red-400 mb-2">
                                <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                                </svg>
                            </div>
                            <h3 class="text-lg font-medium text-red-800 dark:text-red-300 mb-2">Oops! Diagram couldn't be rendered</h3>
                            <pre class="text-red-700 dark:text-red-400 text-sm mb-4 font-mono whitespace-pre-wrap">${error.message}</pre>
                            <div class="w-full">
                                <button 
                                    onclick="this.nextElementSibling.classList.toggle('max-h-0'); this.nextElementSibling.classList.toggle('max-h-[500px]'); this.querySelector('svg').classList.toggle('rotate-180')"
                                    class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors mb-2"
                                >
                                    <svg class="w-4 h-4 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                                    </svg>
                                    View Code
                                </button>
                                <div class="bg-white dark:bg-gray-900/50 p-4 rounded border border-red-100 dark:border-red-800 w-full overflow-hidden transition-all duration-300 max-h-0">
                                    <div class="flex font-mono text-sm">
                                        <pre class="text-gray-400 dark:text-gray-500 pr-2 pl-1 select-none border-r border-gray-200 dark:border-gray-700 min-w-[2.5rem] text-right">${code.split('\n').map((_, i) => i + 1).join('\n')}</pre>
                                        <pre class="text-gray-700 dark:text-gray-800 overflow-x-auto pl-2 whitespace-pre">${code}</pre>
                                    </div>
                                </div>
                            </div>
                        </div>`;
                }
            } finally {
                if (isMounted) {
                    setIsRendering(false);
                }
            }
        };

        renderDiagram();

        return () => {
            isMounted = false;
            setIsRendering(false); // Reset rendering state on cleanup
        };
    }, [code, themeConfig, theme]); // Remove isRendering from dependencies

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
