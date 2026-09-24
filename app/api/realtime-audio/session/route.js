import { NextResponse } from "next/server";
import { getCurrentUser } from "../../utils/auth";
import {
    createRealtimeAudioSession,
    getRealtimeAudioPublicConfig,
    RealtimeAudioError,
} from "../../utils/realtime-audio";
import { assertRealtimeAudioSessionsAllowed } from "../../utils/realtime-audio-rate-limit";

export const runtime = "nodejs";

function getUserId(user) {
    return (
        user?._id || user?.userId || user?.id || user?.email || user?.username
    );
}

function getRateLimitKeys(req, user) {
    const userId = getUserId(user);
    if (userId) return [`user:${userId}`];

    const forwardedFor = req.headers?.get?.("x-forwarded-for");
    const ip =
        forwardedFor?.split(",")[0]?.trim() || req.headers?.get?.("x-real-ip");

    return [ip ? `ip:${ip}` : "anonymous"];
}

export async function GET() {
    return NextResponse.json(getRealtimeAudioPublicConfig());
}

export async function POST(req) {
    const user = await getCurrentUser(false);
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json(
            { error: "Invalid realtime audio request" },
            { status: 400 },
        );
    }

    try {
        await assertRealtimeAudioSessionsAllowed({
            keys: getRateLimitKeys(req, user),
        });

        const session = await createRealtimeAudioSession({
            mode: body?.mode,
            sourceLanguage: body?.sourceLanguage,
            targetLanguage: body?.targetLanguage,
            delay: body?.delay,
            userId: getUserId(user),
        });

        return NextResponse.json(session);
    } catch (error) {
        if (error instanceof RealtimeAudioError) {
            return NextResponse.json(
                { error: error.message, code: error.code },
                { status: error.status },
            );
        }

        if (error?.status === 429 || error?.status === 503) {
            return NextResponse.json(
                {
                    error: error.message,
                    code: error.code,
                    ...(error.retryAfter
                        ? { retryAfter: error.retryAfter }
                        : {}),
                },
                {
                    status: error.status,
                    ...(error.status === 429
                        ? {
                              headers: {
                                  "Retry-After": String(error.retryAfter || 60),
                              },
                          }
                        : {}),
                },
            );
        }

        console.error("Realtime audio session error:", error);
        return NextResponse.json(
            { error: "Failed to create realtime audio session" },
            { status: 500 },
        );
    }
}
