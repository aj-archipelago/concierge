// All visible, motion-enabled portraits share one listener and one frame queue.
// Read every portrait's geometry before writing transforms to avoid layout churn.
const subscribers = new Set();
let frame = null;
let restTimer = null;
let point = null;

function release() {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    clearTimeout(restTimer);
    restTimer = null;
    point = null;
    subscribers.forEach((subscriber) => subscriber.reset());
}

function flush() {
    frame = null;
    if (!point) return;
    const updates = [...subscribers].map((subscriber) => [
        subscriber,
        subscriber.measure(point),
    ]);
    updates.forEach(([subscriber, value]) => {
        if (value) subscriber.update(value);
    });
    clearTimeout(restTimer);
    restTimer = setTimeout(release, 1100);
}

function move(event) {
    if (event.pointerType === "touch") return;
    point = { x: event.clientX, y: event.clientY };
    if (frame === null) frame = requestAnimationFrame(flush);
}

function leave(event) {
    if (!event.relatedTarget) release();
}

export function subscribeWispPointer(subscriber) {
    subscribers.add(subscriber);
    if (subscribers.size === 1) {
        window.addEventListener("pointermove", move, { passive: true });
        window.addEventListener("pointerout", leave, { passive: true });
        window.addEventListener("blur", release);
    }
    return () => {
        subscribers.delete(subscriber);
        if (!subscribers.size) {
            release();
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerout", leave);
            window.removeEventListener("blur", release);
        }
    };
}
