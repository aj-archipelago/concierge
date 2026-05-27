import { NextResponse } from "next/server";
import Applet from "../models/applet.js";

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;
const ONE_MINUTE_MS = 60 * 1000;
const TEN_SECONDS_MS = 10 * 1000;

const activeRequests = new Map();
const rateWindows = new Map();
const limitStrikes = new Map();

export const APPLET_SDK_LIMITS = {
    agentChat: {
        concurrent: 3,
        maxPerWindow: 12,
        windowMs: ONE_MINUTE_MS,
    },
    modelGenerate: {
        concurrent: 3,
        maxPerWindow: 30,
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
}) {
    const activeSuspension = await getActiveSuspension(appletId);
    if (activeSuspension) {
        return jsonGuardError(activeSuspension, 403);
    }

    const key = `${userId || "anonymous"}:${appletId}:${api}`;
    const activeCount = activeRequests.get(key) || 0;
    if (activeCount >= limits.concurrent) {
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

    if (!takeWindowSlot(key, limits)) {
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

    activeRequests.set(key, activeCount + 1);
    try {
        return await run();
    } finally {
        const nextCount = (activeRequests.get(key) || 1) - 1;
        if (nextCount <= 0) {
            activeRequests.delete(key);
        } else {
            activeRequests.set(key, nextCount);
        }
    }
}

export function clearAppletSdkGuardStateForTests() {
    activeRequests.clear();
    rateWindows.clear();
    limitStrikes.clear();
}
