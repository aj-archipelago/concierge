"use client";
import { useEffect, useRef } from "react";
import { subscribeWispPointer } from "./wispPointer";

const HOME = "translate(0px, 0px) rotate(0deg) scale(1, 1)";
const pose = (x = 0, y = 0, angle = 0, sx = 1, sy = sx) =>
    `translate(${x}px, ${y}px) rotate(${angle}deg) scale(${sx}, ${sy})`;

// Each track owns a separate SVG group. Every clip starts and ends at HOME;
// gestures never replace an in-flight pose or cancel it to start another one.
const clips = {
    float: [pose(0, -9, -2), pose(2, -5, 2)],
    sway: [pose(-4, -3, -5), pose(4, -4, 5), pose(-1, -1, -2)],
    stretch: [pose(0, -5, -2, 0.95, 1.06), pose(0, 2, 1, 1.03, 0.98)],
    curious: [pose(-2, -2, -6), pose(2, -2, 4)],
    hello: [pose(0, -7, -5, 1.02, 1.04), pose(0, -3, 2)],
    hop: [
        pose(0, 4, -3, 1.08, 0.93),
        pose(0, -19, 5, 0.96, 1.06),
        pose(0, 3, -2, 1.04, 0.97),
    ],
    wiggle: [
        pose(-2, -3, -9),
        pose(3, -7, 9),
        pose(-2, -3, -6),
        pose(1, -1, 3),
    ],
    nod: [
        pose(0, 3, 7, 1.03, 0.97),
        pose(0, -6, -4, 0.98, 1.03),
        pose(0, 1, 2),
    ],
};
const idleClips = ["float", "curious", "sway", "stretch"];
const tapClips = ["hop", "wiggle", "nod"];
const activityClips = {
    interested: [pose(0, -6, -5, 1.03, 1.05), pose(0, -3, -2)],
    thinking: [pose(0, -3, -5, 0.98, 1.02), pose(1, -4, 4)],
    replying: [pose(0, -3, 0, 1.035, 1.035), pose(0, -1, 0, 0.99, 1.015)],
    attention: [pose(0, -3, -9), pose(0, -2, -6)],
    done: clips.nod,
    error: [pose(0, 1, -10, 0.98, 1), pose(0, 0, 6)],
};
const terminalActivity = (phase) => ["done", "error"].includes(phase);

export default function useWispMotion(seed, animated = true, activity) {
    const refs = useRef({});
    const activityRef = useRef(activity?.phase || "idle");
    activityRef.current = activity?.phase || "idle";
    const activityController = useRef(null);

    useEffect(() => {
        const nodes = refs.current;
        if (!nodes.root?.animate || !window.matchMedia) return;
        const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
        const active = new Set();
        let disposed = false;
        let visible = true;
        let hovered = false;
        let reacting = false;
        let idling = false;
        let pending = null;
        let idleTimer;
        let blinkTimer;
        let statusTimer;
        let statusRunning = false;
        let requestedPhase = "idle";
        let unsubscribePointer;
        let generation = 0;
        let taps = 0;
        let sequence = [...seed].reduce(
            (n, c) => (n * 31 + c.charCodeAt(0)) >>> 0,
            7,
        );
        const random = () => {
            sequence = (Math.imul(sequence, 1664525) + 1013904223) >>> 0;
            return sequence / 4294967296;
        };
        const allowed = () =>
            animated &&
            !reduced.matches &&
            visible &&
            !document.hidden &&
            !disposed;

        function play(node, frames, duration) {
            if (!allowed() || !node) return Promise.resolve();
            const animation = node.animate(frames, {
                duration,
                easing: "cubic-bezier(.45, 0, .25, 1)",
                fill: "none",
            });
            active.add(animation);
            return animation.finished
                .catch(() => {})
                .finally(() => active.delete(animation));
        }
        const move = (node, poses, duration) =>
            play(
                node,
                [HOME, ...poses, HOME].map((transform) => ({ transform })),
                duration,
            );

        async function runStatus() {
            if (!allowed() || statusRunning) return;
            const phase = requestedPhase;
            if (!activityClips[phase]) return;
            statusRunning = true;
            const version = generation;
            const once = terminalActivity(phase);
            if (once) requestedPhase = "idle";
            const duration = phase === "thinking" ? 1700 : 1050;
            const face =
                phase === "interested"
                    ? pose(0, -2, 0, 1.14, 1.12)
                    : phase === "thinking"
                      ? pose(0, -4, -3, 1, 0.88)
                      : phase === "attention" || phase === "error"
                        ? pose(0, 0, -5, 1.05, 1.08)
                        : pose(0, 0, 0, 1.04, phase === "done" ? 0.6 : 1);
            await Promise.all([
                move(nodes.status, activityClips[phase], duration),
                move(nodes.statusEyes, [face, face], duration),
            ]);
            if (version !== generation) return;
            statusRunning = false;
            // A changed phase takes over only at HOME, never mid-pose.
            statusTimer = setTimeout(
                runStatus,
                requestedPhase === phase ? 400 : 0,
            );
        }
        activityController.current = (phase) => {
            clearTimeout(statusTimer);
            requestedPhase =
                !allowed() && terminalActivity(phase) ? "idle" : phase;
            void runStatus();
        };

        function scheduleIdle(delay = 1800 + random() * 2800) {
            clearTimeout(idleTimer);
            if (!allowed()) return;
            idleTimer = setTimeout(async () => {
                if (!allowed()) return;
                if (
                    hovered ||
                    reacting ||
                    idling ||
                    statusRunning ||
                    requestedPhase !== "idle"
                )
                    return scheduleIdle();
                idling = true;
                const version = generation;
                const name = idleClips[Math.floor(random() * idleClips.length)];
                const duration = name === "float" ? 2800 : 2000;
                const tracks = [move(nodes.idle, clips[name], duration)];
                if (name === "curious")
                    tracks.push(
                        move(nodes.look, [pose(-5, 0), pose(4, -1)], duration),
                    );
                await Promise.all(tracks);
                if (version === generation) {
                    idling = false;
                    scheduleIdle();
                }
            }, delay);
        }
        function scheduleBlink() {
            clearTimeout(blinkTimer);
            if (!allowed()) return;
            blinkTimer = setTimeout(
                async () => {
                    const version = generation;
                    await move(nodes.blink, [pose(0, 0, 0, 1, 0.08)], 180);
                    if (version === generation) scheduleBlink();
                },
                2500 + random() * 4600,
            );
        }
        async function react(name) {
            if (!allowed()) return;
            if (reacting) {
                // Keep one response, prioritizing a tap over hover. A burst of
                // clicks cannot accumulate an endless animation queue.
                if (name !== "hello" || !pending) pending = name;
                return;
            }
            reacting = true;
            const version = generation;
            const duration = name === "hello" ? 700 : 1050;
            const tracks = [move(nodes.reaction, clips[name], duration)];
            tracks.push(
                move(
                    nodes.expression,
                    name === "hello"
                        ? [pose(0, -1, 0, 1.05, 1.12)]
                        : [pose(0, 0, 0, 1.1, 0.7), HOME],
                    duration,
                ),
            );
            tracks.push(
                play(
                    nodes.shadow,
                    [
                        { transform: "scale(1)", opacity: 0.2 },
                        {
                            transform:
                                name === "hop" ? "scale(.72)" : "scale(.88)",
                            opacity: 0.12,
                        },
                        { transform: "scale(1)", opacity: 0.2 },
                    ],
                    duration,
                ),
            );
            if (name !== "hello")
                tracks.push(
                    play(
                        nodes.gleam,
                        [
                            { opacity: 0, transform: "scale(.8)" },
                            { opacity: 0.32, transform: "scale(1.05)" },
                            { opacity: 0, transform: "scale(.8)" },
                        ],
                        duration,
                    ),
                );
            await Promise.all(tracks);
            if (version !== generation) return;
            reacting = false;
            const next = pending;
            pending = null;
            if (next) react(next);
            else scheduleIdle();
        }
        function reset() {
            generation++;
            clearTimeout(idleTimer);
            clearTimeout(blinkTimer);
            clearTimeout(statusTimer);
            statusRunning = false;
            requestedPhase = "idle";
            active.forEach((animation) => animation.cancel());
            active.clear();
            reacting = false;
            idling = false;
            pending = null;
            resetLook();
        }
        function resetLook() {
            if (nodes.gaze) nodes.gaze.style.transform = HOME;
            if (nodes.turn) nodes.turn.style.transform = HOME;
        }
        function sync() {
            unsubscribePointer?.();
            unsubscribePointer = null;
            reset();
            if (allowed()) {
                unsubscribePointer = subscribeWispPointer({
                    measure(point) {
                        if (!allowed()) return null;
                        const rect = nodes.root.getBoundingClientRect();
                        const x = point.x - rect.left - rect.width / 2;
                        const y = point.y - rect.top - rect.height / 2;
                        const distance = Math.max(100, Math.hypot(x, y));
                        const horizontal = x / distance;
                        const vertical = y / distance;
                        const round = (value) => Number(value.toFixed(2));
                        // Eyes lead the turn. Shift the face across the body
                        // and narrow it in profile, while the silhouette leans
                        // toward the pointer on its own additive track.
                        return {
                            gaze: pose(
                                round(horizontal * 18),
                                round(vertical * 10),
                                round(horizontal * -3),
                                round(1 - Math.abs(horizontal) * 0.16),
                                round(1 - Math.abs(vertical) * 0.06),
                            ),
                            turn: pose(
                                round(horizontal * 3),
                                round(vertical * 2),
                                round(horizontal * 7),
                                round(1 - Math.abs(horizontal) * 0.07),
                                1,
                            ),
                        };
                    },
                    update(transforms) {
                        for (const name of ["gaze", "turn"]) {
                            if (
                                nodes[name].style.transform !== transforms[name]
                            )
                                nodes[name].style.transform = transforms[name];
                        }
                    },
                    reset: resetLook,
                });
                scheduleIdle(800 + random() * 3200);
                scheduleBlink();
                // Resume ongoing work after visibility/reduced-motion changes,
                // but never replay an old completion or error greeting.
                if (!terminalActivity(activityRef.current))
                    activityController.current(activityRef.current);
            }
        }
        const gestures = {
            enter(event) {
                if (event.pointerType === "touch" || !allowed()) return;
                hovered = true;
                react("hello");
            },
            leave() {
                hovered = false;
                if (pending === "hello") pending = null;
                scheduleIdle();
            },
            tap(event) {
                if (event.button !== 0) return;
                react(tapClips[taps++ % tapClips.length]);
            },
            focus() {
                hovered = true;
                react("hello");
            },
            key(event) {
                if (!event.repeat && ["Enter", " "].includes(event.key))
                    react(tapClips[taps++ % tapClips.length]);
            },
        };
        // Cards and color swatches react across their whole existing hit area;
        // standalone portraits react directly. Navigation events still bubble.
        const target = nodes.root.closest("button") || nodes.root;
        const listeners = {
            pointerenter: gestures.enter,
            pointerleave: gestures.leave,
            pointerdown: gestures.tap,
            focus: gestures.focus,
            blur: gestures.leave,
            keydown: gestures.key,
        };
        Object.entries(listeners).forEach(([event, handler]) =>
            target.addEventListener(event, handler),
        );
        const observer =
            typeof IntersectionObserver === "undefined"
                ? null
                : new IntersectionObserver(([entry]) => {
                      if (visible !== entry.isIntersecting) {
                          visible = entry.isIntersecting;
                          sync();
                      }
                  });
        observer?.observe(nodes.root);
        reduced.addEventListener("change", sync);
        document.addEventListener("visibilitychange", sync);
        sync();
        return () => {
            disposed = true;
            activityController.current = null;
            unsubscribePointer?.();
            reset();
            observer?.disconnect();
            reduced.removeEventListener("change", sync);
            document.removeEventListener("visibilitychange", sync);
            Object.entries(listeners).forEach(([event, handler]) =>
                target.removeEventListener(event, handler),
            );
        };
    }, [seed, animated]);

    useEffect(() => {
        activityController.current?.(activity?.phase || "idle");
    }, [activity?.phase]);

    return {
        ref: (name) => (node) => {
            refs.current[name] = node;
        },
    };
}
