import { NextResponse } from "next/server";
import Applet from "../models/applet.js";

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;
const FIVE_MINUTES_MS = 5 * 60 * 1000;
const ONE_MINUTE_MS = 60 * 1000;
const TEN_SECONDS_MS = 10 * 1000;

const activeRequests = new Map();
const rateWindows = new Map();
const limitStrikes = new Map();
let leaseSeq = 0;

export const APPLET_SDK_DEFAULT_MAX_HOLD_MS = FIVE_MINUTES_MS;

export const APPLET_SDK_LIMITS = {
    agentChat: {
        concurrent: 3,
        maxPerWindow: 12,
        windowMs: ONE_MINUTE_MS,
    },
    sourceQa: {
        concurrent: 3,
        maxPerWindow: 12,
        windowMs: ONE_MINUTE_MS,
        maxHoldMs: 295000,
    },
    modelGenerate: {
        concurrent: 3,
        maxPerWindow: 30,
        windowMs: ONE_MINUTE_MS,
    },
    mediaTask: {
        concurrent: 2,
        maxPerWindow: 12,
        windowMs: ONE_MINUTE_MS,
    },
    serviceToken: {
        concurrent: 3,
        maxPerWindow: 10,
        windowMs: ONE_MINUTE_MS,
    },
    read: {
        concurrent: 6,
        maxPerWindow: 300,
        windowMs: ONE_MINUTE_MS,
    },
    dataWrite: {
        concurrent: 3,
        maxPerWindow: 120,
        windowMs: ONE_MINUTE_MS,
    },
    fileWrite: {
        concurrent: 3,
        maxPerWindow: 30,
        windowMs: ONE_MINUTE_MS,
    },
};

export const APPLET_SDK_SUSPENSION_MS = FIFTEEN_MINUTES_MS;
export const APPLET_SDK_STRIKE_LIMIT = 100;
export const APPLET_SDK_STRIKE_WINDOW_MS = TEN_SECONDS_MS;

function nowMs() {
    return Date.now();
}

function maxHoldMsFor(limits) {
    const maxHoldMs = Number(limits?.maxHoldMs);
    return Number.isFinite(maxHoldMs) && maxHoldMs > 0
        ? maxHoldMs
        : APPLET_SDK_DEFAULT_MAX_HOLD_MS;
}

function suspensionPayload(applet, now = nowMs()) {
    const suspendedUntil = applet?.sdkSuspendedUntil
        ? new Date(applet.sdkSuspendedUntil)
        : null;
    if (!suspendedUntil || suspendedUntil.getTime() <= now) {
        return null;
    }

    const reason =
        applet.sdkSuspendedReason ||
        "This applet exceeded Concierge SDK safety limits.";
    return {
        error: `Applet SDK access is temporarily suspended until ${suspendedUntil.toISOString()}. ${reason} Fix the applet code, then clear the SDK suspension with UpdateAppletMetadata or wait for it to expire.`,
        code: "APPLET_SDK_SUSPENDED",
        suspendedUntil: suspendedUntil.toISOString(),
        reason,
    };
}

function jsonGuardError(payload, status, retryAfterSeconds = null) {
    const response = NextResponse.json(payload, { status });
    if (retryAfterSeconds) {
        response.headers.set("Retry-After", String(retryAfterSeconds));
    }
    return response;
}

function isStreamingResponse(response) {
    return (
        response instanceof Response &&
        response.body &&
        response.headers
            .get("Content-Type")
            ?.toLowerCase()
            .includes("text/event-stream")
    );
}

function responseInitFrom(response) {
    return {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
    };
}

function clearLeaseTimer(lease) {
    if (!lease?.timeoutId) return;
    clearTimeout(lease.timeoutId);
    lease.timeoutId = null;
}

function getLiveLeases(key, now = nowMs()) {
    const leases = activeRequests.get(key) || [];
    const live = [];
    const expired = [];
    for (const lease of leases) {
        if (lease.expiresAt <= now) {
            expired.push(lease);
        } else {
            live.push(lease);
        }
    }

    if (live.length === 0) {
        activeRequests.delete(key);
    } else {
        activeRequests.set(key, live);
    }

    for (const lease of expired) {
        clearLeaseTimer(lease);
        lease.onExpire?.();
    }

    return live;
}

function addLease(key, maxHoldMs, onExpire, now = nowMs()) {
    leaseSeq += 1;
    const lease = {
        id: leaseSeq,
        expiresAt: now + maxHoldMs,
        timeoutId: null,
        onExpire,
    };
    lease.timeoutId = setTimeout(() => {
        lease.timeoutId = null;
        onExpire();
    }, maxHoldMs);
    lease.timeoutId.unref?.();

    const leases = activeRequests.get(key) || [];
    leases.push(lease);
    activeRequests.set(key, leases);
    return lease;
}

function removeLease(key, leaseId) {
    const leases = activeRequests.get(key) || [];
    const remaining = [];
    for (const lease of leases) {
        if (lease.id === leaseId) {
            clearLeaseTimer(lease);
            continue;
        }
        remaining.push(lease);
    }

    if (remaining.length === 0) {
        activeRequests.delete(key);
    } else {
        activeRequests.set(key, remaining);
    }
}

function holdReleaseUntilStreamCloses(response, release) {
    const reader = response.body.getReader();
    let released = false;

    const releaseOnce = () => {
        if (released) return;
        released = true;
        release();
    };

    const cancelReader = () => {
        reader.cancel("sdk-guard-lease-released").catch(() => {});
    };

    const stream = new ReadableStream({
        async pull(controller) {
            try {
                const { done, value } = await reader.read();
                if (done) {
                    releaseOnce();
                    controller.close();
                    return;
                }
                controller.enqueue(value);
            } catch (error) {
                releaseOnce();
                controller.error(error);
            }
        },
        async cancel(reason) {
            try {
                await reader.cancel(reason);
            } finally {
                releaseOnce();
            }
        },
    });

    return {
        response: new Response(stream, responseInitFrom(response)),
        cancelReader,
    };
}

async function getActiveSuspension(appletId, now = nowMs()) {
    const applet = await Applet.findById(appletId)
        .select("sdkSuspendedUntil sdkSuspendedReason")
        .lean();
    const payload = suspensionPayload(applet, now);
    if (payload) return payload;

    if (applet?.sdkSuspendedUntil) {
        await Applet.updateOne(
            { _id: appletId },
            {
                $unset: {
                    sdkSuspendedAt: "",
                    sdkSuspendedUntil: "",
                    sdkSuspendedReason: "",
                },
            },
        );
    }

    return null;
}

function evictExpiredRateWindows(now) {
    for (const [key, window] of rateWindows) {
        if (window.resetAt <= now) {
            rateWindows.delete(key);
        }
    }
}

function takeWindowSlot(key, limits, now = nowMs()) {
    evictExpiredRateWindows(now);

    const current = rateWindows.get(key);
    if (!current || current.resetAt <= now) {
        rateWindows.set(key, {
            resetAt: now + limits.windowMs,
            count: 1,
        });
        return true;
    }

    if (current.count >= limits.maxPerWindow) {
        return false;
    }

    current.count += 1;
    return true;
}

async function recordLimitStrike(appletId, api, reason, now = nowMs()) {
    const key = String(appletId);
    const current = limitStrikes.get(key);
    const strike =
        !current || current.resetAt <= now
            ? { resetAt: now + APPLET_SDK_STRIKE_WINDOW_MS, count: 1 }
            : { ...current, count: current.count + 1 };

    limitStrikes.set(key, strike);
    if (strike.count < APPLET_SDK_STRIKE_LIMIT) {
        return null;
    }

    const suspendedUntil = new Date(now + APPLET_SDK_SUSPENSION_MS);
    const suspensionReason = `Auto-suspended after repeated ${api} SDK ${reason} limit violations.`;
    await Applet.updateOne(
        { _id: appletId },
        {
            $set: {
                sdkSuspendedAt: new Date(now),
                sdkSuspendedUntil: suspendedUntil,
                sdkSuspendedReason: suspensionReason,
            },
        },
    );
    limitStrikes.delete(key);

    return {
        error: `Applet SDK access is temporarily suspended until ${suspendedUntil.toISOString()}. ${suspensionReason} Fix the applet code, then clear the SDK suspension with UpdateAppletMetadata or wait for it to expire.`,
        code: "APPLET_SDK_SUSPENDED",
        suspendedUntil: suspendedUntil.toISOString(),
        reason: suspensionReason,
    };
}

export async function withAppletSdkGuard({
    appletId,
    userId,
    api,
    limits,
    run,
    signal,
}) {
    const activeSuspension = await getActiveSuspension(appletId);
    if (activeSuspension) {
        return jsonGuardError(activeSuspension, 403);
    }

    const key = `${userId || "anonymous"}:${appletId}:${api}`;
    const now = nowMs();
    const liveLeases = getLiveLeases(key, now);
    if (liveLeases.length >= limits.concurrent) {
        const suspension = await recordLimitStrike(
            appletId,
            api,
            "concurrency",
        );
        if (suspension) {
            return jsonGuardError(suspension, 403);
        }
        return jsonGuardError(
            {
                error: "Too many applet SDK requests are already running. Slow the applet down or wait for in-flight requests to finish.",
                code: "APPLET_SDK_CONCURRENCY_LIMITED",
            },
            429,
            5,
        );
    }

    if (!takeWindowSlot(key, limits, now)) {
        const suspension = await recordLimitStrike(appletId, api, "rate");
        if (suspension) {
            return jsonGuardError(suspension, 403);
        }
        return jsonGuardError(
            {
                error: "Too many applet SDK requests. Slow the applet down before trying again.",
                code: "APPLET_SDK_RATE_LIMITED",
            },
            429,
            Math.ceil(limits.windowMs / 1000),
        );
    }

    const maxHoldMs = maxHoldMsFor(limits);
    let released = false;
    let cancelHeldStream = null;
    let lease = null;

    const release = () => {
        if (released) return;
        released = true;
        if (signal) {
            signal.removeEventListener("abort", release);
        }
        if (lease) {
            removeLease(key, lease.id);
        }
        cancelHeldStream?.();
    };

    lease = addLease(key, maxHoldMs, release, now);

    if (signal) {
        if (signal.aborted) {
            release();
        } else {
            signal.addEventListener("abort", release, { once: true });
        }
    }

    try {
        const result = await run();
        if (isStreamingResponse(result)) {
            const held = holdReleaseUntilStreamCloses(result, release);
            cancelHeldStream = held.cancelReader;
            if (released) {
                held.cancelReader();
            }
            return held.response;
        }
        release();
        return result;
    } catch (error) {
        release();
        throw error;
    }
}

export function clearAppletSdkGuardStateForTests() {
    for (const leases of activeRequests.values()) {
        for (const lease of leases) {
            clearLeaseTimer(lease);
        }
    }
    activeRequests.clear();
    rateWindows.clear();
    limitStrikes.clear();
    leaseSeq = 0;
}
