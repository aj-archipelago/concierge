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

// Initialize mermaid once
mermaid.initialize({
    startOnLoad: true,
    securityLevel: "loose",
    suppressErrorRendering: true,
});

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
            if (!containerRef.current || !code || isRendering) return;

            try {
                setIsRendering(true);
                const id = `mermaid-${Math.random().toString(36).substr(2, 9)}`;

                // Update mermaid theme configuration
                mermaid.initialize({
                    ...mermaid.defaultConfig,
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
            } finally {
                if (isMounted) {
                    setIsRendering(false);
                }
            }
        };

        renderDiagram();

        return () => {
            isMounted = false;
        };
    }, [code, themeConfig, isRendering, theme]);

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
