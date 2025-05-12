import { NextResponse } from "next/server";
import { getCurrentUser } from "../utils/auth";
import { createRequestProgressAndQueue } from "../utils/tasks";

export async function POST(req) {
    try {
        const body = await req.json();
        const {
            url,
            language,
            wordTimestamped,
            responseFormat,
            maxLineCount,
            maxLineWidth,
            maxWordsPerLine,
            highlightWords,
            modelOption,
        } = body;

        console.log("Starting transcription request:", {
            url,
            language,
            responseFormat,
            modelOption,
        });

        // Get current user
        const user = await getCurrentUser();
        console.log("User ID:", user._id);

        // Generate a unique request ID
        const requestId = `transcribe-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
        console.log("Generated requestId:", requestId);

        const metadata = {
            url,
            language,
            wordTimestamped,
            responseFormat,
            maxLineCount,
            maxLineWidth,
            maxWordsPerLine,
            highlightWords,
            modelOption,
        };

        const job = await createRequestProgressAndQueue({
            requestId,
            userId: user._id,
            type: "transcribe",
            metadata,
            timeout: 10 * 60 * 1000, // 10 minutes for transcribe
        });

        console.log("Added transcription job to queue:", job.id);
        return NextResponse.json({
            requestId,
            jobId: job.id,
        });
    } catch (error) {
        console.error("Transcription API error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
