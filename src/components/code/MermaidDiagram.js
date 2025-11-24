import React, {
    useEffect,
    useRef,
    useContext,
    useMemo,
    useState,
    useCallback,
} from "react";
import mermaid from "mermaid";
import { ThemeContext } from "../../contexts/ThemeProvider";
import { AlertCircle, Plus, Minus, Copy } from "lucide-react";
import CopyButton from "../CopyButton";
import MermaidPlaceholder from "./MermaidPlaceholder";

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
    const svgWrapperRef = useRef(null);
    const [renderedSvg, setRenderedSvg] = useState(null);
    const [error, setError] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [zoom, setZoom] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const [isPanning, setIsPanning] = useState(false);
    const touchStartPosRef = useRef({ x: 0, y: 0 });
    const pinchStartRef = useRef({ distance: 0, center: { x: 0, y: 0 } });
    const zoomIntervalRef = useRef(null);
    const svgElementRef = useRef(null);

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
                svgElementRef.current = null;
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

                    // Reset zoom and pan when new diagram loads
                    setZoom(1);
                    setPan({ x: 0, y: 0 });

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
                        message: err.message || "Failed to render diagram",
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
    }, [code, themeConfig, theme]);

    // Render SVG in wrapper (only once when renderedSvg changes)
    useEffect(() => {
        if (svgWrapperRef.current && renderedSvg) {
            // Only inject SVG if it hasn't been injected yet
            if (!svgElementRef.current) {
                svgWrapperRef.current.innerHTML = renderedSvg;
                svgElementRef.current =
                    svgWrapperRef.current.querySelector("svg");
                if (svgElementRef.current) {
                    svgElementRef.current.style.transformOrigin =
                        "center center";
                }
            }
        } else {
            svgElementRef.current = null;
        }
    }, [renderedSvg]);

    // Apply zoom/pan transforms (only update transform, don't re-render SVG)
    useEffect(() => {
        if (svgElementRef.current) {
            // Disable transition during dragging for smooth panning
            if (isDragging) {
                svgElementRef.current.style.transition = "none";
            } else {
                svgElementRef.current.style.transition =
                    "transform 0.1s ease-out";
            }
            svgElementRef.current.style.transform = `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`;
        }
    }, [zoom, pan, isDragging]);

    // Handle mouse drag
    const handleMouseDown = useCallback(
        (e) => {
            if (e.button !== 0) return; // Only left mouse button
            e.preventDefault();
            const rect = svgWrapperRef.current?.getBoundingClientRect();
            if (!rect) return;

            setIsDragging(true);
            // Calculate drag start relative to the wrapper element
            setDragStart({
                x: e.clientX - rect.left - pan.x,
                y: e.clientY - rect.top - pan.y,
            });
        },
        [pan],
    );

    const handleMouseMove = useCallback(
        (e) => {
            if (!isDragging || !svgWrapperRef.current || !svgElementRef.current)
                return;
            e.preventDefault();
            const rect = svgWrapperRef.current.getBoundingClientRect();
            // Calculate pan relative to the wrapper element
            const newPan = {
                x: e.clientX - rect.left - dragStart.x,
                y: e.clientY - rect.top - dragStart.y,
            };
            // Update state for persistence
            setPan(newPan);
            // Direct DOM update for immediate feedback (no React render delay)
            svgElementRef.current.style.transform = `translate(${newPan.x}px, ${newPan.y}px) scale(${zoom})`;
        },
        [isDragging, dragStart, zoom],
    );

    const handleMouseUp = useCallback(() => {
        setIsDragging(false);
    }, []);

    // Global mouseup handler to stop dragging when mouse leaves window
    useEffect(() => {
        if (isDragging) {
            const handleGlobalMouseUp = () => {
                setIsDragging(false);
            };
            document.addEventListener("mouseup", handleGlobalMouseUp);
            return () => {
                document.removeEventListener("mouseup", handleGlobalMouseUp);
            };
        }
    }, [isDragging]);

    // Calculate distance between two touches
    const getTouchDistance = (touch1, touch2) => {
        const dx = touch2.clientX - touch1.clientX;
        const dy = touch2.clientY - touch1.clientY;
        return Math.sqrt(dx * dx + dy * dy);
    };

    // Calculate center point between two touches
    const getTouchCenter = (touch1, touch2) => {
        return {
            x: (touch1.clientX + touch2.clientX) / 2,
            y: (touch1.clientY + touch2.clientY) / 2,
        };
    };

    // Handle touch for mobile - pinch to zoom and natural panning
    const handleTouchStart = useCallback(
        (e) => {
            if (!svgWrapperRef.current || !svgElementRef.current) return;

            if (e.touches.length === 2) {
                // Pinch to zoom
                e.preventDefault();
                const touch1 = e.touches[0];
                const touch2 = e.touches[1];
                const distance = getTouchDistance(touch1, touch2);
                const center = getTouchCenter(touch1, touch2);
                const rect = svgWrapperRef.current.getBoundingClientRect();

                pinchStartRef.current = {
                    distance,
                    center: {
                        x: center.x - rect.left,
                        y: center.y - rect.top,
                    },
                    initialZoom: zoom,
                    initialPan: { ...pan },
                };
            } else if (e.touches.length === 1 && zoom > 1) {
                // Single touch panning (only when zoomed in)
                const rect = svgWrapperRef.current.getBoundingClientRect();
                const touch = e.touches[0];
                touchStartPosRef.current = {
                    x: touch.clientX,
                    y: touch.clientY,
                };
                setIsDragging(true);
                setIsPanning(false);
                setDragStart({
                    x: touch.clientX - rect.left - pan.x,
                    y: touch.clientY - rect.top - pan.y,
                });
            }
            // At default zoom with single touch, don't interfere - allow normal scroll
        },
        [pan, zoom],
    );

    const handleTouchMove = useCallback(
        (e) => {
            if (!svgWrapperRef.current || !svgElementRef.current) return;

            if (e.touches.length === 2 && pinchStartRef.current.distance > 0) {
                // Pinch to zoom
                e.preventDefault();
                const touch1 = e.touches[0];
                const touch2 = e.touches[1];
                const currentDistance = getTouchDistance(touch1, touch2);
                const scale = currentDistance / pinchStartRef.current.distance;
                const newZoom = Math.max(
                    0.25,
                    Math.min(8, pinchStartRef.current.initialZoom * scale),
                );

                // Calculate pan to keep pinch center point fixed
                const rect = svgWrapperRef.current.getBoundingClientRect();
                const currentCenter = getTouchCenter(touch1, touch2);
                const centerX = currentCenter.x - rect.left;
                const centerY = currentCenter.y - rect.top;

                const newPan = {
                    x:
                        centerX -
                        (centerX - pinchStartRef.current.initialPan.x) *
                            (newZoom / pinchStartRef.current.initialZoom),
                    y:
                        centerY -
                        (centerY - pinchStartRef.current.initialPan.y) *
                            (newZoom / pinchStartRef.current.initialZoom),
                };

                setZoom(newZoom);
                setPan(newPan);
                svgElementRef.current.style.transform = `translate(${newPan.x}px, ${newPan.y}px) scale(${newZoom})`;
            } else if (e.touches.length === 1 && isDragging && zoom > 1) {
                // Single touch panning (only when zoomed in)
                const touch = e.touches[0];
                const deltaX = Math.abs(
                    touch.clientX - touchStartPosRef.current.x,
                );
                const deltaY = Math.abs(
                    touch.clientY - touchStartPosRef.current.y,
                );
                const moveThreshold = 10; // pixels

                // If we've moved enough, we're panning - block scroll
                if (deltaX > moveThreshold || deltaY > moveThreshold) {
                    e.preventDefault(); // Block scroll when panning
                    if (!isPanning) {
                        setIsPanning(true);
                    }

                    const rect = svgWrapperRef.current.getBoundingClientRect();
                    const newPan = {
                        x: touch.clientX - rect.left - dragStart.x,
                        y: touch.clientY - rect.top - dragStart.y,
                    };
                    setPan(newPan);
                    svgElementRef.current.style.transform = `translate(${newPan.x}px, ${newPan.y}px) scale(${zoom})`;
                }
            }
        },
        [isDragging, dragStart, zoom, isPanning],
    );

    const handleTouchEnd = useCallback(() => {
        setIsDragging(false);
        setIsPanning(false);
        pinchStartRef.current = { distance: 0, center: { x: 0, y: 0 } };
    }, []);

    // Continuous zoom on button hold
    const handleZoomInMouseDown = useCallback((e) => {
        e.preventDefault();
        e.stopPropagation();
        // Immediate zoom
        setZoom((prev) => Math.min(prev + 0.25, 8));
        // Start continuous zoom
        zoomIntervalRef.current = setInterval(() => {
            setZoom((prev) => {
                const newZoom = Math.min(prev + 0.25, 8);
                if (newZoom >= 8) {
                    if (zoomIntervalRef.current) {
                        clearInterval(zoomIntervalRef.current);
                        zoomIntervalRef.current = null;
                    }
                }
                return newZoom;
            });
        }, 100); // Zoom every 100ms
    }, []);

    const handleZoomOutMouseDown = useCallback((e) => {
        e.preventDefault();
        e.stopPropagation();
        // Immediate zoom
        setZoom((prev) => Math.max(prev - 0.25, 0.25));
        // Start continuous zoom
        zoomIntervalRef.current = setInterval(() => {
            setZoom((prev) => {
                const newZoom = Math.max(prev - 0.25, 0.25);
                if (newZoom <= 0.25) {
                    if (zoomIntervalRef.current) {
                        clearInterval(zoomIntervalRef.current);
                        zoomIntervalRef.current = null;
                    }
                }
                return newZoom;
            });
        }, 100); // Zoom every 100ms
    }, []);

    const handleZoomMouseUp = useCallback(() => {
        if (zoomIntervalRef.current) {
            clearInterval(zoomIntervalRef.current);
            zoomIntervalRef.current = null;
        }
    }, []);

    // Cleanup interval on unmount
    useEffect(() => {
        return () => {
            if (zoomIntervalRef.current) {
                clearInterval(zoomIntervalRef.current);
            }
        };
    }, []);

    const handleReset = useCallback((e) => {
        e.preventDefault();
        e.stopPropagation();
        setZoom(1);
        setPan({ x: 0, y: 0 });
    }, []);

    // Prepare error text for copying
    const errorText = error
        ? `Mermaid Diagram Error:\n${error.message}\n\nSource Code:\n${error.code}`
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
                        Mermaid diagram failed to render
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
                        <>
                            <div
                                ref={svgWrapperRef}
                                className="mermaid-svg-wrapper relative overflow-auto flex items-center justify-center select-none"
                                style={{
                                    width: "100%",
                                    minHeight: "300px",
                                    maxHeight: "500px",
                                    cursor: isDragging ? "grabbing" : "grab",
                                    userSelect: "none",
                                    WebkitUserSelect: "none",
                                    touchAction:
                                        zoom > 1
                                            ? "none"
                                            : "pan-x pan-y pinch-zoom",
                                }}
                                onMouseDown={handleMouseDown}
                                onMouseMove={handleMouseMove}
                                onMouseUp={handleMouseUp}
                                onMouseLeave={handleMouseUp}
                                onTouchStart={handleTouchStart}
                                onTouchMove={handleTouchMove}
                                onTouchEnd={handleTouchEnd}
                            />
                            <div className="absolute top-1/2 -translate-y-1/2 right-1.5 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                                <button
                                    type="button"
                                    onMouseDown={handleZoomInMouseDown}
                                    onMouseUp={handleZoomMouseUp}
                                    onMouseLeave={handleZoomMouseUp}
                                    className="p-1.5 bg-white dark:bg-gray-800 rounded-full shadow-lg hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700"
                                    title="Zoom in (hold to zoom continuously)"
                                    aria-label="Zoom in"
                                >
                                    <Plus className="w-3.5 h-3.5 text-gray-700 dark:text-gray-300" />
                                </button>
                                <button
                                    type="button"
                                    onMouseDown={handleZoomOutMouseDown}
                                    onMouseUp={handleZoomMouseUp}
                                    onMouseLeave={handleZoomMouseUp}
                                    className="p-1.5 bg-white dark:bg-gray-800 rounded-full shadow-lg hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700"
                                    title="Zoom out (hold to zoom continuously)"
                                    aria-label="Zoom out"
                                >
                                    <Minus className="w-3.5 h-3.5 text-gray-700 dark:text-gray-300" />
                                </button>
                                <button
                                    type="button"
                                    onClick={handleReset}
                                    className="p-1.5 bg-white dark:bg-gray-800 rounded-full shadow-lg hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 text-xs font-medium text-gray-700 dark:text-gray-300 leading-none"
                                    title="Reset zoom and pan"
                                    aria-label="Reset"
                                >
                                    ↺
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (renderedSvg) {
                                            navigator.clipboard.writeText(
                                                renderedSvg,
                                            );
                                        }
                                    }}
                                    className="p-1.5 bg-white dark:bg-gray-800 rounded-full shadow-lg hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700"
                                    title="Copy SVG"
                                    aria-label="Copy SVG"
                                >
                                    <Copy className="w-3.5 h-3.5 text-gray-700 dark:text-gray-300" />
                                </button>
                            </div>
                        </>
                    )}
                </div>
            )}
        </>
    );
};

export default MermaidDiagram;
