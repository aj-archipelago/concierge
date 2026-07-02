"use client";

import { cn } from "@/lib/utils";
import { AppWindow, Loader2 } from "lucide-react";
import { getDownloadUrl } from "@/src/utils/fileDownloadUtils";
import { useEffect, useState } from "react";

export const appCatalogIconButtonClass =
    "inline-flex h-9 w-9 items-center justify-center rounded-md border border-gray-300 bg-white/75 text-gray-800 shadow-sm backdrop-blur transition hover:bg-gray-950 hover:text-white focus:outline-none focus:ring-2 focus:ring-sky-300/70 dark:border-white/20 dark:bg-white/[0.12] dark:text-white dark:hover:bg-white dark:hover:text-gray-950 dark:focus:ring-white/70";

export const appCatalogActionButtonClass =
    "inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-xs font-bold shadow-sm backdrop-blur transition focus:outline-none focus:ring-2 focus:ring-sky-300/70 dark:focus:ring-white/70";

export const appCatalogPrimaryActionButtonClass =
    "border-sky-200 bg-sky-50/90 text-sky-900 hover:border-sky-300 hover:bg-sky-100 dark:border-sky-300/30 dark:bg-sky-400/[0.16] dark:text-sky-50 dark:hover:border-sky-200/50 dark:hover:bg-sky-400/[0.26]";

export const appCatalogConfirmActionButtonClass =
    "border-sky-600 bg-sky-600 text-white hover:border-sky-700 hover:bg-sky-700 dark:border-sky-500 dark:bg-sky-600 dark:text-white dark:hover:border-sky-400 dark:hover:bg-sky-500";

export const appCatalogDangerActionButtonClass =
    "border-red-200 bg-red-50/85 text-red-700 hover:border-red-300 hover:bg-red-100 dark:border-red-300/30 dark:bg-red-500/[0.16] dark:text-red-50 dark:hover:border-red-300/70 dark:hover:bg-red-500/[0.32]";

const lightImageSurfaceVisualClass =
    "border-white/60 bg-white/[0.56] text-slate-950 shadow-sm backdrop-blur-md";

const darkImageSurfaceVisualClass =
    "border-white/20 bg-gray-950/[0.38] text-white shadow-sm backdrop-blur";

const imageSurfaceBaseClass = "border";
const imageContentSurfaceClass =
    "border-0 bg-transparent p-0 shadow-none backdrop-blur-none";
const lightDefaultImageOverlayClass =
    "bg-[linear-gradient(180deg,rgba(255,255,255,0)_0%,rgba(255,255,255,0)_25%,rgba(255,255,255,0.8)_33%,rgba(255,255,255,0.94)_100%)]";
const lightHomeImageOverlayClass =
    "bg-[linear-gradient(180deg,rgba(255,255,255,0)_0%,rgba(255,255,255,0)_40%,rgba(255,255,255,0.8)_66%,rgba(255,255,255,0.94)_100%)]";
const lightAppLibraryImageOverlayClass =
    "bg-[linear-gradient(180deg,rgba(255,255,255,0)_0%,rgba(255,255,255,0)_40%,rgba(255,255,255,0.8)_66%,rgba(255,255,255,0.94)_100%)]";
const darkDefaultImageOverlayClass =
    "bg-[linear-gradient(180deg,rgba(2,6,23,0)_0%,rgba(2,6,23,0)_25%,rgba(2,6,23,0.8)_33%,rgba(2,6,23,0.94)_100%)]";
const darkHomeImageOverlayClass =
    "bg-[linear-gradient(180deg,rgba(2,6,23,0.08)_0%,rgba(2,6,23,0.36)_42%,rgba(2,6,23,0.84)_100%)]";
const darkAppLibraryImageOverlayClass =
    "bg-[linear-gradient(180deg,rgba(2,6,23,0)_0%,rgba(2,6,23,0)_40%,rgba(2,6,23,0.8)_66%,rgba(2,6,23,0.94)_100%)]";

export function AppCatalogBadge({ children, icon: Icon, tone = "sky" }) {
    const toneClassName =
        tone === "emerald"
            ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
            : tone === "violet"
              ? "bg-violet-50 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300"
              : "bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300";

    return (
        <span
            className={cn(
                "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
                toneClassName,
            )}
        >
            {Icon && <Icon className="h-3 w-3" />}
            {children}
        </span>
    );
}

function readCurrentTheme() {
    if (typeof document === "undefined") return "light";
    if (
        document.body?.classList?.contains("dark") ||
        document.documentElement?.classList?.contains("dark") ||
        document.documentElement?.getAttribute("data-color-mode") === "dark" ||
        document.documentElement?.getAttribute("data-theme") === "dark"
    ) {
        return "dark";
    }
    return "light";
}

export function useAppCatalogTheme() {
    const [theme, setTheme] = useState(readCurrentTheme);

    useEffect(() => {
        const Observer =
            typeof MutationObserver !== "undefined"
                ? MutationObserver
                : typeof window !== "undefined"
                  ? window.MutationObserver
                  : undefined;
        const updateTheme = () => setTheme(readCurrentTheme());
        if (!Observer) {
            if (typeof window === "undefined") return undefined;
            const intervalId = window.setInterval(updateTheme, 250);
            updateTheme();
            return () => window.clearInterval(intervalId);
        }

        const observer = new Observer(updateTheme);
        if (document.body) {
            observer.observe(document.body, {
                attributes: true,
                attributeFilter: ["class"],
            });
        }
        observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ["class", "data-color-mode", "data-theme"],
        });
        updateTheme();

        return () => observer.disconnect();
    }, []);

    return theme;
}

export default function AppCatalogCard({
    title,
    titleAttribute,
    icon: IconComponent = AppWindow,
    isHighlighted = false,
    badge = null,
    meta = [],
    chips = [],
    description = null,
    imageUrl = null,
    imageLightUrl = null,
    imageDarkUrl = null,
    imageBadge = null,
    imageMeta = null,
    imageActions = null,
    imageActionsAlwaysVisible = false,
    footer = null,
    actions = null,
    topRightActions = null,
    onClick,
    isBusy = false,
    busyLabel,
    isInteractionActive = false,
    suppressInteractionMotion = false,
    disableHover = false,
    density = "normal",
    shape = "default",
    imageOverlayVariant = "default",
    themeOverride = null,
    contentStackClassName,
    className,
}) {
    const isNative = density === "native";
    const isCompact = density === "compact";
    const isSquare = shape === "square";
    const metaItems = meta.filter(Boolean);
    const chipItems = [
        ...new Set(chips.filter(Boolean).map((chip) => String(chip).trim())),
    ]
        .filter(Boolean)
        .slice(0, isCompact ? 4 : 5);
    const displayLightImageUrl =
        imageLightUrl || imageUrl || imageDarkUrl
            ? getDownloadUrl(imageLightUrl || imageUrl || imageDarkUrl)
            : null;
    const displayDarkImageUrl =
        imageDarkUrl || imageUrl || imageLightUrl
            ? getDownloadUrl(imageDarkUrl || imageUrl || imageLightUrl)
            : null;
    const detectedTheme = useAppCatalogTheme();
    const theme = themeOverride || detectedTheme;
    const displayImageUrl =
        theme === "dark"
            ? displayDarkImageUrl || displayLightImageUrl
            : displayLightImageUrl || displayDarkImageUrl;
    const hasBackgroundImage = Boolean(displayImageUrl);
    const usesImageStyleLayout =
        hasBackgroundImage ||
        (!isNative && imageOverlayVariant === "app-library");
    const imageSurfaceClass = usesImageStyleLayout
        ? cn(
              imageSurfaceBaseClass,
              theme === "dark"
                  ? darkImageSurfaceVisualClass
                  : lightImageSurfaceVisualClass,
          )
        : null;
    const imageContentClass = usesImageStyleLayout
        ? cn(
              imageContentSurfaceClass,
              theme === "dark" ? "text-white" : "text-slate-950",
          )
        : null;
    const imageBorderClass =
        theme === "dark" ? "border-white/[0.15]" : "border-gray-200";
    const imageOverlayClass =
        theme === "dark"
            ? imageOverlayVariant === "home"
                ? darkHomeImageOverlayClass
                : imageOverlayVariant === "app-library"
                  ? darkAppLibraryImageOverlayClass
                  : darkDefaultImageOverlayClass
            : imageOverlayVariant === "home"
              ? lightHomeImageOverlayClass
              : imageOverlayVariant === "app-library"
                ? lightAppLibraryImageOverlayClass
                : lightDefaultImageOverlayClass;
    const canClick = typeof onClick === "function" && !isBusy;
    const showDecorativeBackground = !isNative;
    const titleClassName = usesImageStyleLayout
        ? theme === "dark"
            ? "text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)]"
            : "text-slate-950 drop-shadow-[0_1px_1px_rgba(255,255,255,0.75)]"
        : "text-gray-950 dark:text-white";
    const metaClassName = usesImageStyleLayout
        ? theme === "dark"
            ? "text-white/70"
            : "text-slate-700/80"
        : "text-gray-600 dark:text-white/70";
    const bodyClassName = usesImageStyleLayout
        ? theme === "dark"
            ? "text-white/90 drop-shadow-[0_1px_2px_rgba(0,0,0,0.4)]"
            : "text-slate-950/85 drop-shadow-[0_1px_1px_rgba(255,255,255,0.7)]"
        : "text-gray-700 dark:text-white/[0.85]";
    const footerClassName = usesImageStyleLayout
        ? theme === "dark"
            ? "text-white/[0.65]"
            : "text-slate-700/75"
        : "text-gray-500 dark:text-white/[0.6]";

    return (
        <article
            data-testid="app-catalog-card"
            data-interaction-active={
                !disableHover && isInteractionActive ? "true" : undefined
            }
            className={cn(
                "group relative flex flex-col overflow-hidden rounded-lg border shadow-sm transition",
                suppressInteractionMotion && "transition-none",
                !disableHover &&
                    "hover:-translate-y-0.5 hover:border-sky-300 hover:shadow-md data-[interaction-active=true]:-translate-y-0.5 data-[interaction-active=true]:border-sky-300 data-[interaction-active=true]:shadow-md dark:hover:border-sky-700 dark:data-[interaction-active=true]:border-sky-700",
                hasBackgroundImage
                    ? "bg-gray-950"
                    : "bg-white dark:bg-gray-950",
                isSquare
                    ? "aspect-square min-h-0"
                    : isNative
                      ? "min-h-40"
                      : isCompact
                        ? "min-h-72"
                        : "min-h-80",
                canClick && "cursor-pointer",
                isHighlighted
                    ? "border-sky-300/70 dark:border-sky-700/80"
                    : usesImageStyleLayout
                      ? imageBorderClass
                      : "border-gray-200 dark:border-white/[0.15]",
                isBusy && "cursor-wait",
                className,
            )}
            onClick={canClick ? onClick : undefined}
            aria-busy={isBusy || undefined}
        >
            {isBusy && (
                <div
                    className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-white/70 dark:bg-gray-800/70"
                    role={busyLabel ? "status" : undefined}
                    aria-label={busyLabel}
                >
                    <Loader2 className="h-6 w-6 animate-spin text-sky-600 dark:text-sky-400" />
                </div>
            )}

            {showDecorativeBackground && (
                <div className="absolute inset-0 overflow-hidden">
                    {hasBackgroundImage ? (
                        <img
                            data-testid="app-catalog-card-image"
                            src={displayImageUrl}
                            alt=""
                            className={cn(
                                "h-full w-full object-cover transition duration-500",
                                suppressInteractionMotion &&
                                    "transition-none duration-0",
                                !disableHover &&
                                    "group-hover:scale-[1.03] group-data-[interaction-active=true]:scale-[1.03]",
                            )}
                            loading="lazy"
                            aria-hidden="true"
                        />
                    ) : (
                        <div className="h-full w-full bg-[linear-gradient(135deg,#f8fafc_0%,#dff7ff_46%,#f8e7ef_100%)] dark:bg-[linear-gradient(135deg,#020617_0%,#164e63_50%,#581c1c_100%)]">
                            <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(15,23,42,0.06)_1px,transparent_1px),linear-gradient(0deg,rgba(15,23,42,0.05)_1px,transparent_1px)] bg-[size:48px_48px] opacity-70 dark:bg-[linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(0deg,rgba(255,255,255,0.06)_1px,transparent_1px)] dark:opacity-35" />
                            <IconComponent className="absolute end-4 top-20 h-24 w-24 text-gray-900/[0.06] dark:text-white/[0.07] sm:end-6 sm:top-24 sm:h-28 sm:w-28" />
                            <div className="absolute start-8 top-10 h-20 w-px rotate-45 bg-gray-900/10 dark:bg-white/10" />
                            <div className="absolute end-20 bottom-10 h-28 w-px rotate-45 bg-gray-900/10 dark:bg-white/10" />
                        </div>
                    )}
                    <div
                        data-testid="app-catalog-card-overlay"
                        className={cn(
                            "absolute inset-0",
                            usesImageStyleLayout
                                ? imageOverlayClass
                                : "bg-[linear-gradient(180deg,rgba(255,255,255,0.08)_0%,rgba(255,255,255,0.5)_46%,rgba(255,255,255,0.92)_100%)] dark:bg-[linear-gradient(180deg,rgba(2,6,23,0.1)_0%,rgba(2,6,23,0.52)_54%,rgba(2,6,23,0.9)_100%)]",
                        )}
                    />
                </div>
            )}

            {(imageBadge || imageMeta || imageActions || topRightActions) && (
                <div
                    className={cn(
                        "relative z-[1] flex items-start justify-between gap-2",
                        isCompact ? "px-3 pt-3" : "px-4 pt-4",
                    )}
                >
                    {imageBadge ? (
                        <span
                            data-testid="app-catalog-card-image-badge"
                            className={cn(
                                "min-w-0 truncate rounded-full border font-semibold uppercase tracking-wide shadow-sm backdrop-blur",
                                usesImageStyleLayout
                                    ? imageSurfaceClass
                                    : "border-gray-200 bg-white/70 text-gray-700 dark:border-white/20 dark:bg-gray-950/[0.55] dark:text-white",
                                isCompact
                                    ? "px-2.5 py-1 text-[10px]"
                                    : "px-3 py-1.5 text-[11px]",
                            )}
                        >
                            {imageBadge}
                        </span>
                    ) : (
                        <span />
                    )}
                    <div className="flex min-w-0 shrink-0 items-center justify-end gap-1.5">
                        {imageMeta && (
                            <span
                                className={cn(
                                    "shrink-0 rounded-full border font-semibold shadow-sm backdrop-blur",
                                    usesImageStyleLayout
                                        ? imageSurfaceClass
                                        : "border-gray-200 bg-white/70 text-gray-700 dark:border-white/20 dark:bg-gray-950/[0.55] dark:text-white",
                                    isCompact
                                        ? "px-2.5 py-1 text-[10px]"
                                        : "px-3 py-1.5 text-[11px]",
                                )}
                            >
                                {imageMeta}
                            </span>
                        )}
                        {(imageActions || topRightActions) && (
                            <div
                                data-testid="app-catalog-card-image-actions"
                                className={cn(
                                    "flex min-w-0 shrink-0 items-center justify-end gap-1 overflow-x-auto transition duration-150",
                                    suppressInteractionMotion &&
                                        "transition-none duration-0",
                                    imageActionsAlwaysVisible
                                        ? "pointer-events-auto translate-y-0 opacity-100"
                                        : "pointer-events-none translate-y-0.5 opacity-0 group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:translate-y-0 group-focus-within:opacity-100 group-data-[interaction-active=true]:pointer-events-auto group-data-[interaction-active=true]:translate-y-0 group-data-[interaction-active=true]:opacity-100",
                                )}
                                onClick={(event) => event.stopPropagation()}
                            >
                                {imageActions}
                                {topRightActions}
                            </div>
                        )}
                    </div>
                </div>
            )}

            <div
                className={cn(
                    "relative z-[1] flex flex-1 flex-col",
                    isNative
                        ? "justify-between"
                        : usesImageStyleLayout
                          ? "justify-end"
                          : "justify-center",
                )}
            >
                <div
                    className={cn(
                        "flex flex-col",
                        usesImageStyleLayout &&
                            (isCompact ? "px-3 pb-3" : "px-4 pb-4"),
                        contentStackClassName,
                    )}
                >
                    <div
                        data-testid="app-catalog-card-header"
                        className={cn(
                            "flex items-start",
                            usesImageStyleLayout
                                ? "gap-2.5 p-0"
                                : isCompact || isNative
                                  ? "gap-2 p-3 pb-0"
                                  : "gap-2.5 p-3 pb-0",
                        )}
                    >
                        <div
                            data-testid="app-catalog-card-icon-surface"
                            className={cn(
                                "flex shrink-0 items-center justify-center rounded-lg border shadow-sm backdrop-blur",
                                usesImageStyleLayout
                                    ? cn(imageContentClass, "-mt-1")
                                    : "border-gray-200 bg-white/75 text-gray-700 dark:border-white/20 dark:bg-white/[0.12] dark:text-white",
                                usesImageStyleLayout
                                    ? isCompact || isNative
                                        ? "h-8 w-8"
                                        : "h-9 w-9"
                                    : isCompact || isNative
                                      ? "h-9 w-9"
                                      : "h-11 w-11",
                            )}
                        >
                            <IconComponent
                                className={cn(
                                    isCompact || isNative
                                        ? "h-5 w-5"
                                        : "h-6 w-6",
                                )}
                            />
                        </div>
                        <div
                            data-testid="app-catalog-card-title-surface"
                            className={cn(
                                "min-w-0 flex-1",
                                usesImageStyleLayout &&
                                    imageContentSurfaceClass,
                            )}
                        >
                            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                                <h3
                                    className={cn(
                                        "truncate font-semibold",
                                        titleClassName,
                                        isCompact || isNative
                                            ? "text-base"
                                            : "text-lg",
                                    )}
                                    title={titleAttribute || title}
                                >
                                    {title}
                                </h3>
                                {badge}
                            </div>
                            {metaItems.length > 0 && (
                                <div
                                    className={cn(
                                        "mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs",
                                        metaClassName,
                                    )}
                                >
                                    {metaItems.map((item, index) => (
                                        <span
                                            key={index}
                                            className="inline-flex items-center gap-1"
                                        >
                                            {index > 0 && (
                                                <span
                                                    className={cn(
                                                        usesImageStyleLayout
                                                            ? "text-white/30"
                                                            : "text-gray-400 dark:text-white/30",
                                                    )}
                                                    aria-hidden="true"
                                                >
                                                    /
                                                </span>
                                            )}
                                            {item}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {description && (
                        <p
                            data-testid="app-catalog-card-description"
                            className={cn(
                                bodyClassName,
                                usesImageStyleLayout
                                    ? cn(
                                          imageContentSurfaceClass,
                                          "mt-1 line-clamp-2",
                                          isCompact || isNative
                                              ? "text-xs leading-5"
                                              : "text-sm leading-5",
                                      )
                                    : isNative
                                      ? "mx-3 mt-2 line-clamp-2 text-xs leading-5"
                                      : isCompact
                                        ? "mx-3 mt-2 line-clamp-2 min-h-[2.5rem] text-xs leading-5"
                                        : "mx-3 mt-2 line-clamp-2 min-h-[2.5rem] text-sm leading-5",
                            )}
                        >
                            {description}
                        </p>
                    )}

                    {chipItems.length > 0 && !usesImageStyleLayout && (
                        <div
                            className={cn(
                                "flex flex-wrap gap-1.5",
                                "mx-3 mt-2",
                            )}
                        >
                            {chipItems.map((chip, index) => (
                                <span
                                    key={`${chip}-${index}`}
                                    className={cn(
                                        "inline-flex max-w-full items-center rounded-full border px-2 py-0.5 text-[11px] font-medium shadow-sm backdrop-blur",
                                        usesImageStyleLayout
                                            ? imageSurfaceClass
                                            : "border-gray-200 bg-white/70 text-gray-700 dark:border-white/20 dark:bg-white/[0.12] dark:text-white",
                                    )}
                                >
                                    <span className="truncate">{chip}</span>
                                </span>
                            ))}
                        </div>
                    )}

                    <div
                        className={cn(
                            "flex flex-col gap-3",
                            usesImageStyleLayout ? "pt-2" : "p-3 pt-2",
                        )}
                    >
                        {footer && (
                            <div
                                className={cn(
                                    "min-w-0 truncate text-xs",
                                    footerClassName,
                                )}
                            >
                                {footer}
                            </div>
                        )}
                        {actions && (
                            <div
                                className="flex min-h-9 max-w-full shrink-0 flex-nowrap items-center justify-end gap-2 overflow-x-auto overflow-y-hidden"
                                onClick={(event) => event.stopPropagation()}
                            >
                                {actions}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </article>
    );
}
