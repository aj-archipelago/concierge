import React, { useEffect, useRef, useContext } from "react";
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

    useEffect(() => {
        if (containerRef.current) {
            containerRef.current.innerHTML = "";
            const id = `mermaid-${Math.random().toString(36).substr(2, 9)}`;

            mermaid.initialize({
                startOnLoad: true,
                theme: theme === "dark" ? "dark" : "default",
                securityLevel: "loose",
                themeVariables:
                    theme === "dark" ? darkThemeVars : lightThemeVars,
                suppressErrorRendering: true,
            });

            mermaid
                .render(id, code)
                .then(({ svg }) => {
                    // Force SVG to be responsive and overflow visible
                    //let styledSvg = svg.replace('<svg', '<svg style="max-width: 60%; height: auto; display: block; overflow: visible;"');
                    // Also remove any overflow="hidden" attributes
                    //styledSvg = styledSvg.replace(/overflow="hidden"/g, 'overflow="visible"');
                    containerRef.current.innerHTML = svg;
                    // Debug log
                    console.log("Mermaid diagram rendered:", {
                        id,
                        code,
                        theme,
                    });
                })
                .catch((error) => {
                    console.error("Error rendering mermaid diagram:", error);
                    containerRef.current.innerHTML = `Error rendering diagram: ${error.message}`;
                });
        }
    }, [code, theme]);

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
