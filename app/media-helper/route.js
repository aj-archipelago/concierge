import { NextResponse } from "next/server";
import { isRequestAuthorized } from "../api/utils/requestAuthorization";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const getMediaHelperUrl = (request) => {
    const mediaHelperUrl = process.env.CORTEX_MEDIA_API_URL;
    if (!mediaHelperUrl && process.env.NODE_ENV === "production") {
        throw new Error("CORTEX_MEDIA_API_URL is not configured");
    }

    const target = new URL(mediaHelperUrl || "http://localhost:5000");
    const incoming = new URL(request.url);

    for (const [key, value] of incoming.searchParams) {
        if (!target.searchParams.has(key)) {
            target.searchParams.append(key, value);
        }
    }

    return target;
};

const getForwardHeaders = (request) => {
    const headers = new Headers();

    for (const name of ["accept", "content-type"]) {
        const value = request.headers.get(name);
        if (value) {
            headers.set(name, value);
        }
    }

    return headers;
};

async function proxyMediaHelper(request) {
    if (!isRequestAuthorized(request)) {
        return NextResponse.json(
            { success: false, message: "Unauthorized" },
            { status: 401 },
        );
    }

    const method = request.method.toUpperCase();
    const init = {
        method,
        headers: getForwardHeaders(request),
        redirect: "manual",
        signal: request.signal,
    };

    if (method !== "GET" && method !== "HEAD") {
        init.body = request.body;
        init.duplex = "half";
    }

    try {
        const response = await fetch(getMediaHelperUrl(request), init);
        return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
        });
    } catch (error) {
        console.error("Failed to proxy media-helper request:", error);
        return NextResponse.json(
            { success: false, message: "Media helper request failed" },
            { status: 502 },
        );
    }
}

export const GET = proxyMediaHelper;
export const POST = proxyMediaHelper;
export const PUT = proxyMediaHelper;
export const PATCH = proxyMediaHelper;
export const DELETE = proxyMediaHelper;
export const HEAD = proxyMediaHelper;
export const OPTIONS = proxyMediaHelper;
