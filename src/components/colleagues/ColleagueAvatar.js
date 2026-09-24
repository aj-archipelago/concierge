"use client";
import { useId } from "react";
import styles from "./ColleagueAvatar.module.css";
import useWispMotion from "./useWispMotion";

// Keep saved portrait IDs compatible; they now select Wisp's color.
export const AVATARS = ["orbit", "sprout", "prism", "spark", "wave", "compass"];
const palettes = {
    personal: ["#fff2ba", "#edb83f", "#8e550d"],
    orbit: ["#b3a8ff", "#7562de", "#3b2d8d"],
    sprout: ["#9ce8df", "#3bb5af", "#126663"],
    prism: ["#ffe3a1", "#e0aa49", "#93621f"],
    spark: ["#ffc2ad", "#d98177", "#854152"],
    wave: ["#a6dcff", "#4d9ed8", "#244e96"],
    compass: ["#f0c0ef", "#b974c0", "#6e3684"],
};
const familyHues = {
    orbit: 251,
    sprout: 175,
    prism: 38,
    spark: 12,
    wave: 205,
    compass: 297,
};
export function getEntityWispVariant(entity) {
    if (entity?.isDefault || entity?.kind === "personal") return "personal";
    // The colleagues API supplies "orbit" for legacy entities without an
    // avatar. Only explicitly created colleagues have a chosen color family.
    return entity?.kind === "colleague" ? entity.avatar : undefined;
}
export function getWispPalette(variant, entityId) {
    if (variant === "personal" || !entityId)
        return palettes[variant] || palettes.orbit;
    // Derive a stable individual shade from the durable entity id. Legacy
    // avatars have no Wisp family, so give them a color across the spectrum.
    let hash = 2166136261;
    for (const character of String(entityId))
        hash = Math.imul(hash ^ character.codePointAt(0), 16777619) >>> 0;
    const hue =
        familyHues[variant] === undefined
            ? 70 + (hash % 28000) / 100
            : (familyHues[variant] + (hash % 2800) / 100 - 14 + 360) % 360;
    const saturation = 50 + ((hash >>> 12) % 1800) / 100;
    const lightness = 49 + ((hash >>> 20) % 900) / 100;
    return [
        `hsl(${hue} ${saturation}% 83%)`,
        `hsl(${hue} ${saturation}% ${lightness}%)`,
        `hsl(${hue} ${saturation}% 28%)`,
    ];
}
export default function ColleagueAvatar({
    variant,
    entityId,
    className = "h-14 w-14",
    animated = true,
    activity,
}) {
    const id = `wisp-${useId().replace(/:/g, "")}`;
    const motion = useWispMotion(id, animated, activity);
    const [light, middle, shade] = getWispPalette(variant, entityId);
    return (
        <span
            ref={motion.ref("root")}
            aria-hidden="true"
            data-wisp=""
            data-wisp-variant={variant}
            data-animated={animated}
            data-wisp-activity={activity?.phase || "idle"}
            className={`${styles.avatar} inline-flex shrink-0 items-center justify-center ${className}`}
        >
            <svg
                viewBox="30 18 145 172"
                className="h-full w-full overflow-visible"
                fill="none"
            >
                <defs>
                    {variant === "personal" ? (
                        <linearGradient
                            id={id}
                            x1="18%"
                            y1="8%"
                            x2="88%"
                            y2="94%"
                        >
                            <stop stopColor="#fff9d9" />
                            <stop offset="22%" stopColor="#f4cd65" />
                            <stop offset="43%" stopColor="#c48a1c" />
                            <stop offset="52%" stopColor="#fff0a6" />
                            <stop offset="64%" stopColor="#e6b139" />
                            <stop offset="84%" stopColor="#b27516" />
                            <stop offset="100%" stopColor="#754509" />
                        </linearGradient>
                    ) : (
                        <radialGradient id={id} cx="28%" cy="20%" r="95%">
                            <stop stopColor={light} />
                            <stop offset="43%" stopColor={middle} />
                            <stop offset="100%" stopColor={shade} />
                        </radialGradient>
                    )}
                    <filter id={`${id}-shadow`}>
                        <feGaussianBlur stdDeviation="4" />
                    </filter>
                </defs>
                <ellipse
                    ref={motion.ref("shadow")}
                    className={styles.shadow}
                    cx="108"
                    cy="179"
                    rx="38"
                    ry="6"
                    fill={shade}
                    opacity=".2"
                    filter={`url(#${id}-shadow)`}
                />
                <g
                    ref={motion.ref("status")}
                    className={styles.body}
                    data-wisp-track="status"
                >
                    <g
                        ref={motion.ref("idle")}
                        className={styles.body}
                        data-wisp-track="idle"
                    >
                        <g
                            ref={motion.ref("reaction")}
                            className={styles.body}
                            data-wisp-track="reaction"
                        >
                            <g
                                ref={motion.ref("turn")}
                                className={styles.turn}
                                data-wisp-track="turn"
                            >
                                <ellipse
                                    ref={motion.ref("gleam")}
                                    className={styles.gleam}
                                    cx="110"
                                    cy="112"
                                    rx="60"
                                    ry="66"
                                    stroke={light}
                                    strokeWidth="3"
                                />
                                <path
                                    d="M133 29c8 36 4 40 22 62 21 27 17 63-8 79-31 20-77 5-85-26-8-28 7-52 31-69 18-13 32-24 40-46Z"
                                    fill={`url(#${id})`}
                                />
                                <path
                                    d="M131 35c0 38-49 48-54 80-3 21 9 38 25 44-25-3-36-26-27-51 9-24 43-40 56-73Z"
                                    fill={light}
                                    opacity=".45"
                                />
                                <ellipse
                                    cx="122"
                                    cy="69"
                                    rx="8"
                                    ry="13"
                                    transform="rotate(30 122 69)"
                                    fill="white"
                                    opacity=".15"
                                />
                                <g
                                    ref={motion.ref("statusEyes")}
                                    className={styles.eyes}
                                    data-wisp-track="status-eyes"
                                >
                                    <g
                                        ref={motion.ref("look")}
                                        className={styles.eyes}
                                    >
                                        <g
                                            ref={motion.ref("gaze")}
                                            className={styles.gaze}
                                            data-wisp-track="gaze"
                                        >
                                            <g
                                                ref={motion.ref("expression")}
                                                className={styles.eyes}
                                            >
                                                <g
                                                    ref={motion.ref("blink")}
                                                    className={styles.eyes}
                                                    fill="#1b2039"
                                                    opacity=".9"
                                                >
                                                    <rect
                                                        x="90"
                                                        y="109"
                                                        width="9"
                                                        height="15"
                                                        rx="4.5"
                                                        transform="rotate(-7 95 116)"
                                                    />
                                                    <rect
                                                        x="116"
                                                        y="106"
                                                        width="9"
                                                        height="15"
                                                        rx="4.5"
                                                        transform="rotate(-7 120 113)"
                                                    />
                                                </g>
                                            </g>
                                        </g>
                                    </g>
                                </g>
                            </g>
                        </g>
                    </g>
                </g>
            </svg>
        </span>
    );
}
