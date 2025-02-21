import { NextResponse } from "next/server";
import { Queue } from "bullmq";
import Redis from "ioredis";
import { AZURE_VIDEO_TRANSLATE } from "../../../src/graphql";
import { getClient } from "../../../src/graphql";
import RequestProgress from "../models/request-progress.mjs";
import { getCurrentUser } from "../utils/auth";

const connection = new Redis(
    process.env.REDIS_CONNECTION_STRING || "redis://localhost:6379",
    {
        maxRetriesPerRequest: null,
    },
);

const requestProgressQueue = new Queue("request-progress", {
    connection,
});

export async function POST(req) {
    try {
        const body = await req.json();
        const { sourceLocale, targetLocale, targetLocaleLabel, url } = body;

        console.log("Starting video translation request:", {
            sourceLocale,
            targetLocale,
            targetLocaleLabel,
            url,
        });

        // Initial GraphQL query to start the translation
        const { data } = await getClient().query({
            query: AZURE_VIDEO_TRANSLATE,
            variables: {
                mode: "uploadvideooraudiofileandcreatetranslation",
                sourcelocale: sourceLocale,
                targetlocale: targetLocale,
                sourcevideooraudiofilepath: url,
                stream: true,
            },
            fetchPolicy: "no-cache",
        });

        const requestId = data.azure_video_translate.result;

        console.log("Got requestId from Azure:", requestId);

        // Get current user
        const user = await getCurrentUser();

        // Create initial progress record
        await RequestProgress.findOneAndUpdate(
            { requestId },
            {
                owner: user._id,
                type: "video-translate",
                status: "in_progress",
                metadata: {
                    sourceLocale,
                    targetLocale,
                    url,
                },
            },
            {
                new: true,
                upsert: true,
            },
        );

        // Add job to queue
        const job = await requestProgressQueue.add(
            "request-progress",
            {
                requestId,
                type: "video-translate",
                userId: user._id,
                metadata: {
                    sourceLocale,
                    targetLocale,
                    targetLocaleLabel,
                    url,
                },
            },
            {
                timeout: 5 * 60 * 1000,
                removeOnComplete: {
                    age: 24 * 3600,
                    count: 1000,
                },
                removeOnFail: {
                    age: 24 * 3600,
                },
            },
        );

        console.log("Added job to queue:", job.id);

        return NextResponse.json({
            requestId,
            jobId: job.id,
        });
    } catch (error) {
        console.error("Azure video translate error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
