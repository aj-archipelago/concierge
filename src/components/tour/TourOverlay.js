"use client";

import {
    useContext,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
} from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { LanguageContext } from "../../contexts/LanguageProvider";
import { useTour } from "../../contexts/TourContext";

const SPOTLIGHT_PADDING = 8;
const TOOLTIP_GAP = 12;
const VIEWPORT_MARGIN = 12;
const RESOLVE_TIMEOUT_MS = 1200;
const MOBILE_BREAKPOINT = 640;

function isMobileViewport() {
    if (typeof window === "undefined") return false;
    return window.innerWidth < MOBILE_BREAKPOINT;
}

/**
 * Renders the active tour step: a dimmed spotlight around the target element
 * plus a tooltip card with navigation. Steps with no target render as a
 * centered dialog. Missing (optional) targets auto-advance.
 */
export default function TourOverlay() {
    const { isActive, currentStep, index, steps, next, back, endTour } =
        useTour();
    const { t } = useTranslation();
    const { direction = "ltr" } = useContext(LanguageContext) || {};

    const [mounted, setMounted] = useState(false);
    const [rect, setRect] = useState(null); // spotlight target rect (viewport coords)
    const [pos, setPos] = useState(null); // tooltip position { top, left, sheet }
    const tooltipRef = useRef(null);

    useEffect(() => {
        setMounted(true);
    }, []);

    // Resolve the current step's target and keep its rect in sync.
    useEffect(() => {
        if (!isActive || !currentStep) return undefined;

        if (!currentStep.target) {
            setRect(null);
            return undefined;
        }

        let cancelled = false;
        let cleanupWatch = null;
        let pollTimer = null;
        const selector = `[data-tour="${currentStep.target}"]`;
        const startedAt = Date.now();

        const watch = (el) => {
            const onChange = () => {
                const cur = document.querySelector(selector);
                if (!cur) return;
                const r = cur.getBoundingClientRect();
                setRect({
                    top: r.top,
                    left: r.left,
                    width: r.width,
                    height: r.height,
                });
            };
            window.addEventListener("scroll", onChange, true);
            window.addEventListener("resize", onChange);
            const ro =
                typeof ResizeObserver !== "undefined"
                    ? new ResizeObserver(onChange)
                    : null;
            ro?.observe(el);
            // Re-measure across a smooth-scroll settle.
            const raf = requestAnimationFrame(onChange);
            const s1 = setTimeout(onChange, 250);
            const s2 = setTimeout(onChange, 500);
            onChange();
            return () => {
                window.removeEventListener("scroll", onChange, true);
                window.removeEventListener("resize", onChange);
                ro?.disconnect();
                cancelAnimationFrame(raf);
                clearTimeout(s1);
                clearTimeout(s2);
            };
        };

        const poll = () => {
            if (cancelled) return;
            const el = document.querySelector(selector);
            if (el) {
                el.scrollIntoView({
                    block: "center",
                    inline: "nearest",
                    behavior: "smooth",
                });
                cleanupWatch = watch(el);
                return;
            }
            if (Date.now() - startedAt >= RESOLVE_TIMEOUT_MS) {
                if (currentStep.optional) {
                    next();
                } else {
                    endTour({ completed: false });
                }
                return;
            }
            pollTimer = setTimeout(poll, 50);
        };

        pollTimer = setTimeout(poll, 0);

        return () => {
            cancelled = true;
            if (pollTimer) clearTimeout(pollTimer);
            cleanupWatch?.();
        };
    }, [isActive, currentStep, index, next, endTour]);

    // Position the tooltip relative to the spotlight (or centered).
    useLayoutEffect(() => {
        if (!isActive || !currentStep) return;
        const node = tooltipRef.current;

        if (!currentStep.target || !rect) {
            setPos({ centered: true });
            return;
        }
        if (!node) return;

        const tip = node.getBoundingClientRect();
        const vw = window.innerWidth;
        const vh = window.innerHeight;

        if (isMobileViewport()) {
            setPos({ sheet: true });
            return;
        }

        const placement = currentStep.placement || "bottom";
        const preferTop = placement.startsWith("top");
        const spaceBelow = vh - (rect.top + rect.height);
        const spaceAbove = rect.top;

        let top;
        if (preferTop && spaceAbove > tip.height + TOOLTIP_GAP) {
            top = rect.top - tip.height - TOOLTIP_GAP;
        } else if (spaceBelow > tip.height + TOOLTIP_GAP) {
            top = rect.top + rect.height + TOOLTIP_GAP;
        } else if (spaceAbove > tip.height + TOOLTIP_GAP) {
            top = rect.top - tip.height - TOOLTIP_GAP;
        } else {
            // Not enough room either side — pin within the viewport.
            top = Math.max(
                VIEWPORT_MARGIN,
                Math.min(
                    rect.top + rect.height + TOOLTIP_GAP,
                    vh - tip.height - VIEWPORT_MARGIN,
                ),
            );
        }

        // Horizontally align to the target, then clamp into the viewport.
        const alignEnd = placement.endsWith("end");
        let left = alignEnd ? rect.left + rect.width - tip.width : rect.left;
        left = Math.max(
            VIEWPORT_MARGIN,
            Math.min(left, vw - tip.width - VIEWPORT_MARGIN),
        );
        top = Math.max(
            VIEWPORT_MARGIN,
            Math.min(top, vh - tip.height - VIEWPORT_MARGIN),
        );

        setPos({ top, left });
    }, [isActive, currentStep, rect, direction]);

    // Keyboard controls.
    useEffect(() => {
        if (!isActive) return undefined;
        const onKey = (e) => {
            if (e.key === "Escape") {
                e.preventDefault();
                endTour({ completed: false });
            } else if (e.key === "ArrowRight") {
                e.preventDefault();
                next();
            } else if (e.key === "ArrowLeft") {
                e.preventDefault();
                back();
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [isActive, next, back, endTour]);

    if (!mounted || !isActive || !currentStep) return null;

    const total = steps.length;
    const isLast = index >= total - 1;
    const isFirst = index === 0;
    const showSpotlight = Boolean(currentStep.target && rect);

    const tooltipStyle = (() => {
        if (!pos || pos.centered || pos.sheet) return undefined;
        return { position: "fixed", top: pos.top, left: pos.left };
    })();

    const tooltipClass = [
        "pointer-events-auto w-[calc(100vw-1.5rem)] max-w-sm rounded-2xl border border-gray-200 bg-white p-4 shadow-xl dark:border-gray-700 dark:bg-gray-800",
        pos?.sheet
            ? "fixed inset-x-3 bottom-3"
            : pos?.centered || !pos
              ? "fixed start-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rtl:translate-x-1/2"
              : "",
        // Hide until positioned to avoid a flash in the wrong spot.
        !pos && currentStep.target ? "invisible" : "",
    ]
        .filter(Boolean)
        .join(" ");

    return createPortal(
        <div
            dir={direction}
            className="fixed inset-0 z-[100]"
            data-testid="tour-overlay"
        >
            {/* Click-blocker: prevents interacting with the page behind the tour. */}
            <div
                className="absolute inset-0"
                aria-hidden="true"
                onClick={(e) => e.stopPropagation()}
            />

            {showSpotlight ? (
                <div
                    aria-hidden="true"
                    className="pointer-events-none absolute rounded-xl ring-2 ring-sky-400/80 transition-all duration-150"
                    style={{
                        top: rect.top - SPOTLIGHT_PADDING,
                        left: rect.left - SPOTLIGHT_PADDING,
                        width: rect.width + SPOTLIGHT_PADDING * 2,
                        height: rect.height + SPOTLIGHT_PADDING * 2,
                        boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)",
                    }}
                />
            ) : (
                <div
                    aria-hidden="true"
                    className="absolute inset-0 bg-black/60"
                />
            )}

            <div
                ref={tooltipRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="tour-step-title"
                className={tooltipClass}
                style={tooltipStyle}
            >
                <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-gray-400 dark:text-gray-500">
                        {t("Step {{current}} of {{total}}", {
                            current: index + 1,
                            total,
                        })}
                    </span>
                    <button
                        type="button"
                        onClick={() => endTour({ completed: false })}
                        className="text-xs text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
                    >
                        {t("Skip")}
                    </button>
                </div>
                <h3
                    id="tour-step-title"
                    className="mb-1 text-base font-semibold text-gray-900 dark:text-gray-100"
                >
                    {currentStep.title}
                </h3>
                <p className="mb-4 text-sm text-gray-600 dark:text-gray-300">
                    {currentStep.body}
                </p>
                <div className="flex items-center justify-end gap-2">
                    {!isFirst && (
                        <button
                            type="button"
                            onClick={back}
                            className="inline-flex h-9 items-center rounded-lg border border-gray-200 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
                        >
                            {t("Back")}
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={next}
                        className="inline-flex h-9 items-center rounded-lg bg-sky-600 px-3 text-sm font-medium text-white hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-500"
                    >
                        {isLast ? t("Finish") : t("Next")}
                    </button>
                </div>
            </div>
        </div>,
        document.body,
    );
}
