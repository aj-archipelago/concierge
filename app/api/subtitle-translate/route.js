import { NextResponse } from "next/server";
import { getCurrentUser } from "../utils/auth";
import { createRequestProgressAndQueue } from "../utils/tasks";

export async function POST(req) {
    try {
        const body = await req.json();
        const { text, to, format, name } = body;

        console.log("Starting subtitle translation request:", {
            to,
            format,
            name,
        });

        // Get current user
        const user = await getCurrentUser();
        console.log("User ID:", user._id);

        // Generate a unique request ID
        const requestId = `subtitle-translate-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
        console.log("Generated requestId:", requestId);

        const metadata = {
            text,
            to,
            format,
            name,
        };

        const job = await createRequestProgressAndQueue({
            requestId,
            userId: user._id,
            type: "subtitle-translate",
            metadata,
            timeout: 5 * 60 * 1000, // 5 minutes for translation
        });

        console.log("Added translation job to queue:", job.id);

        return NextResponse.json({
            requestId,
            jobId: job.id,
        });
    } catch (error) {
        console.error("Translation API error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
