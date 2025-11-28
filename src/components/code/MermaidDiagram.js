import React, {
    useEffect,
    useContext,
    useMemo,
    useState,
    useRef,
    useCallback,
} from "react";
import mermaid from "mermaid";
import { ThemeContext } from "../../contexts/ThemeProvider";
import { AlertCircle, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useApolloClient } from "@apollo/client";
import CopyButton from "../CopyButton";
import MermaidPlaceholder from "./MermaidPlaceholder";
import SVGViewer from "../common/SVGViewer";
import { QUERIES } from "../../graphql";

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

const MermaidDiagram = ({ code, onLoad, onMermaidFix }) => {
    const { theme } = useContext(ThemeContext);
    const { t } = useTranslation();
    const apolloClient = useApolloClient();
    const [renderedSvg, setRenderedSvg] = useState(null);
    const [error, setError] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isFixing, setIsFixing] = useState(false);
    const [currentCode, setCurrentCode] = useState(code);
    const retryAttemptsRef = useRef(0);
    const maxRetries = 3;
    const isRetryingRef = useRef(false);

    // Memoize the theme configuration
    const themeConfig = useMemo(
        () => ({
            theme: theme === "dark" ? "dark" : "default",
            themeVariables: theme === "dark" ? darkThemeVars : lightThemeVars,
        }),
        [theme],
    );

    // Update currentCode when code prop changes
    useEffect(() => {
        setCurrentCode(code);
        retryAttemptsRef.current = 0;
        isRetryingRef.current = false;
        setError(null);
        setIsFixing(false);
    }, [code]);

    // Function to extract mermaid code from response
    const extractMermaidFromResponse = (response) => {
        const responseStr =
            typeof response === "string" ? response : String(response);
        const mermaidMatch = responseStr.match(/```mermaid\s*([\s\S]*?)\s*```/);
        return mermaidMatch ? mermaidMatch[1].trim() : responseStr.trim();
    };

    // Function to call sys_tool_mermaid to fix the chart
    const attemptFix = useCallback(
        async (errorMessage, brokenCode) => {
            if (
                isRetryingRef.current ||
                retryAttemptsRef.current >= maxRetries
            ) {
                return null;
            }

            isRetryingRef.current = true;
            setIsFixing(true);
            retryAttemptsRef.current += 1;

            try {
                const detailedInstructions = `Fix this chart. The mermaid chart failed to render with the following error:\n\n${errorMessage}\n\nThe broken mermaid code is:\n\n\`\`\`mermaid\n${brokenCode}\n\`\`\`\n\nPlease fix the syntax errors and return a corrected mermaid chart.`;

                const query = QUERIES.SYS_TOOL_MERMAID;
                const variables = {
                    chatHistory: [
                        {
                            role: "user",
                            content: detailedInstructions,
                        },
                    ],
                    async: false,
                };

                const response = await apolloClient.query({
                    query,
                    variables,
                });

                const result = response.data?.sys_tool_mermaid?.result;
                if (result) {
                    const fixedCode = extractMermaidFromResponse(result);
                    if (fixedCode && fixedCode !== brokenCode) {
                        return fixedCode;
                    }
                }
            } catch (error) {
                console.error("Error calling sys_tool_mermaid:", error);
            } finally {
                setIsFixing(false);
                isRetryingRef.current = false;
            }

            return null;
        },
        [apolloClient],
    );

    useEffect(() => {
        let isMounted = true;
        let renderingInProgress = false;

        const renderDiagram = async () => {
            if (!currentCode) return;

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

                const { svg } = await mermaid.render(id, currentCode);

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
                    const errorObj = {
                        message: err.message || t("Failed to render diagram"),
                        code: currentCode,
                    };
                    setError(errorObj);

                    // Attempt to fix the chart automatically
                    if (
                        retryAttemptsRef.current < maxRetries &&
                        !isRetryingRef.current
                    ) {
                        const brokenCode = currentCode; // Capture broken code before fix
                        attemptFix(errorObj.message, brokenCode).then(
                            (fixedCode) => {
                                if (fixedCode && isMounted) {
                                    // Update code to trigger re-render with fixed code
                                    setCurrentCode(fixedCode);
                                    // Reset error state so it will try to render the fixed code
                                    setError(null);

                                    // Update the saved message with the fixed code
                                    if (onMermaidFix) {
                                        onMermaidFix(brokenCode, fixedCode);
                                    }
                                } else if (
                                    isMounted &&
                                    retryAttemptsRef.current < maxRetries
                                ) {
                                    // If fix failed but we have retries left, the error will persist
                                    // and we can try again on the next render attempt
                                }
                            },
                        );
                    }
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
    }, [currentCode, themeConfig, theme, t, attemptFix, onLoad, onMermaidFix]);

    // Prepare error text for copying
    const errorText = error
        ? `${t("Mermaid Diagram Error")}:\n${error.message}\n\n${t("Source Code")}:\n${error.code}`
        : "";

    // Show loading state
    if ((isLoading || isFixing) && !error) {
        return (
            <MermaidPlaceholder
                spinnerKey={`mermaid-loading-${currentCode?.substring(0, 20)}`}
            />
        );
    }

    return (
        <>
            {error ? (
                <div className="mermaid-placeholder my-3 px-2 sm:px-3 py-2 rounded-md border border-red-200 dark:border-red-800/50 bg-red-50/50 dark:bg-red-900/10 flex items-center gap-2 text-xs sm:text-sm text-gray-500 dark:text-gray-400 relative group">
                    <div className="w-4 h-4 text-red-500 dark:text-red-400 flex-shrink-0">
                        {isFixing ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <AlertCircle className="w-4 h-4" />
                        )}
                    </div>
                    <span className="font-medium flex-1">
                        {isFixing
                            ? t("Attempting to fix chart...")
                            : t("Mermaid diagram failed to render")}
                    </span>
                    {retryAttemptsRef.current >= maxRetries && !isFixing && (
                        <CopyButton
                            item={errorText}
                            className="absolute top-1 end-1 opacity-0 group-hover:opacity-60 hover:opacity-100 transition-opacity pointer-events-auto"
                        />
                    )}
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
