import React, {
    useRef,
    useState,
    useCallback,
    useEffect,
    useContext,
} from "react";
import { Plus, Minus, Copy, RotateCcw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { LanguageContext } from "../../contexts/LanguageProvider";

/**
 * Reusable SVG Viewer component with zoom, pan, and reset functionality
 * @param {Object} props
 * @param {string} props.svgContent - The SVG content as a string
 * @param {string} props.className - Additional CSS classes for the container
 * @param {string} props.wrapperClassName - Additional CSS classes for the wrapper
 * @param {Function} props.onCopy - Optional callback when SVG is copied
 * @param {number} props.minZoom - Minimum zoom level (default: 0.25)
 * @param {number} props.maxZoom - Maximum zoom level (default: 8)
 * @param {string} props.minHeight - Minimum height for the wrapper (default: "300px")
 * @param {string} props.maxHeight - Maximum height for the wrapper (default: "500px")
 */
const SVGViewer = ({
    svgContent,
    className = "",
    wrapperClassName = "",
    onCopy,
    minZoom = 0.25,
    maxZoom = 8,
    minHeight = "300px",
    maxHeight = "500px",
}) => {
    const { t } = useTranslation();
    const { direction } = useContext(LanguageContext);
    const isRTL = direction === "rtl";

    const svgWrapperRef = useRef(null);
    const svgElementRef = useRef(null);
    const [zoom, setZoom] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const [isPanning, setIsPanning] = useState(false);
    const touchStartPosRef = useRef({ x: 0, y: 0 });
    const pinchStartRef = useRef({ distance: 0, center: { x: 0, y: 0 } });
    const zoomIntervalRef = useRef(null);

    // Render SVG in wrapper (only once when svgContent changes)
    useEffect(() => {
        if (svgWrapperRef.current && svgContent) {
            // Only inject SVG if it hasn't been injected yet
            if (!svgElementRef.current) {
                svgWrapperRef.current.innerHTML = svgContent;
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
    }, [svgContent]);

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
                    minZoom,
                    Math.min(
                        maxZoom,
                        pinchStartRef.current.initialZoom * scale,
                    ),
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
        [isDragging, dragStart, zoom, isPanning, minZoom, maxZoom],
    );

    const handleTouchEnd = useCallback(() => {
        setIsDragging(false);
        setIsPanning(false);
        pinchStartRef.current = { distance: 0, center: { x: 0, y: 0 } };
    }, []);

    // Continuous zoom on button hold
    const handleZoomInMouseDown = useCallback(
        (e) => {
            e.preventDefault();
            e.stopPropagation();
            // Immediate zoom
            setZoom((prev) => Math.min(prev + 0.25, maxZoom));
            // Start continuous zoom
            zoomIntervalRef.current = setInterval(() => {
                setZoom((prev) => {
                    const newZoom = Math.min(prev + 0.25, maxZoom);
                    if (newZoom >= maxZoom) {
                        if (zoomIntervalRef.current) {
                            clearInterval(zoomIntervalRef.current);
                            zoomIntervalRef.current = null;
                        }
                    }
                    return newZoom;
                });
            }, 100); // Zoom every 100ms
        },
        [maxZoom],
    );

    const handleZoomOutMouseDown = useCallback(
        (e) => {
            e.preventDefault();
            e.stopPropagation();
            // Immediate zoom
            setZoom((prev) => Math.max(prev - 0.25, minZoom));
            // Start continuous zoom
            zoomIntervalRef.current = setInterval(() => {
                setZoom((prev) => {
                    const newZoom = Math.max(prev - 0.25, minZoom);
                    if (newZoom <= minZoom) {
                        if (zoomIntervalRef.current) {
                            clearInterval(zoomIntervalRef.current);
                            zoomIntervalRef.current = null;
                        }
                    }
                    return newZoom;
                });
            }, 100); // Zoom every 100ms
        },
        [minZoom],
    );

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

    const handleCopy = useCallback(() => {
        if (svgContent) {
            navigator.clipboard.writeText(svgContent);
            if (onCopy) {
                onCopy();
            }
        }
    }, [svgContent, onCopy]);

    if (!svgContent) {
        return null;
    }

    return (
        <div className={`relative group ${className}`}>
            <div
                ref={svgWrapperRef}
                className={`relative overflow-auto flex items-center justify-center select-none ${wrapperClassName}`}
                style={{
                    width: "100%",
                    minHeight,
                    maxHeight,
                    cursor: isDragging ? "grabbing" : "grab",
                    userSelect: "none",
                    WebkitUserSelect: "none",
                    touchAction: zoom > 1 ? "none" : "pan-x pan-y pinch-zoom",
                }}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
            />
            <div
                className={`absolute top-1/2 -translate-y-1/2 ${
                    isRTL ? "left-1.5" : "right-1.5"
                } flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10`}
            >
                <button
                    type="button"
                    onMouseDown={handleZoomInMouseDown}
                    onMouseUp={handleZoomMouseUp}
                    onMouseLeave={handleZoomMouseUp}
                    className="p-1.5 bg-white dark:bg-gray-800 rounded-full shadow-lg hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700"
                    title={t("Zoom in (hold to zoom continuously)")}
                    aria-label={t("Zoom in")}
                >
                    <Plus className="w-3.5 h-3.5 text-gray-700 dark:text-gray-300" />
                </button>
                <button
                    type="button"
                    onMouseDown={handleZoomOutMouseDown}
                    onMouseUp={handleZoomMouseUp}
                    onMouseLeave={handleZoomMouseUp}
                    className="p-1.5 bg-white dark:bg-gray-800 rounded-full shadow-lg hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700"
                    title={t("Zoom out (hold to zoom continuously)")}
                    aria-label={t("Zoom out")}
                >
                    <Minus className="w-3.5 h-3.5 text-gray-700 dark:text-gray-300" />
                </button>
                <button
                    type="button"
                    onClick={handleReset}
                    className="p-1.5 bg-white dark:bg-gray-800 rounded-full shadow-lg hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 text-xs font-medium text-gray-700 dark:text-gray-300 leading-none"
                    title={t("Reset zoom and pan")}
                    aria-label={t("Reset")}
                >
                    <RotateCcw className="w-3.5 h-3.5 text-gray-700 dark:text-gray-300" />
                </button>
                <button
                    type="button"
                    onClick={handleCopy}
                    className="p-1.5 bg-white dark:bg-gray-800 rounded-full shadow-lg hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700"
                    title={t("Copy SVG")}
                    aria-label={t("Copy SVG")}
                >
                    <Copy className="w-3.5 h-3.5 text-gray-700 dark:text-gray-300" />
                </button>
            </div>
        </div>
    );
};

export default SVGViewer;


