import { notifyFeedback } from "./notification";
import Feedback from "../models/feedback";
import { getCurrentUser } from "../utils/auth";

function getBaseUrl(request) {
    if (process.env.NEXT_PUBLIC_APP_URL) {
        return process.env.NEXT_PUBLIC_APP_URL;
    }
    const forwarded = request.headers.get("x-forwarded-host");
    const host = forwarded || request.headers.get("host") || "localhost:3000";
    const proto = request.headers.get("x-forwarded-proto") || "http";
    return `${proto}://${host}`;
}

function normalizeCategory(category) {
    if (["bug", "idea", "question", "other"].includes(category)) {
        return category;
    }
    return "bug";
}

function normalizeSource(source) {
    return source === "agent" ? "agent" : "user";
}

export async function POST(req) {
    try {
        const body = await req.json();
        const { message, screenshot, pageUrl, userAgent } = body;
        const trimmedMessage = String(message || "").trim();

        if (!trimmedMessage) {
            return Response.json(
                { error: "Feedback message is required" },
                { status: 400 },
            );
        }

        const user = await getCurrentUser();

        if (!user) {
            return Response.json(
                { error: "Authentication required" },
                { status: 401 },
            );
        }

        const feedback = await Feedback.create({
            message: trimmedMessage,
            category: normalizeCategory(body.category),
            screenshotUrl: screenshot || null,
            pageUrl: pageUrl || null,
            userAgent: userAgent || null,
            source: normalizeSource(body.source),
            user: user._id || null,
            userName: user.name || null,
            username: user.username || null,
        });

        const adminUrl = `${getBaseUrl(req)}/admin/feedback?selected=${feedback._id}`;
        void notifyFeedback({ feedback, adminUrl });

        return Response.json({
            success: true,
            feedbackId: feedback._id,
        });
    } catch (error) {
        console.error("Error saving feedback:", error);
        return Response.json(
            { error: "Failed to send feedback" },
            { status: 500 },
        );
    }
}

export const dynamic = "force-dynamic";
