import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req) {
    try {
        const url = new URL(req.url);
        const urlInput =
            url.searchParams.get("youtubeInput") ||
            url.searchParams.get("youtubeURL") ||
            url.searchParams.get("url");

        if (!urlInput) {
            return NextResponse.json(
                { error: "No URL provided" },
                { status: 400 },
            );
        }

        if (isYoutubeUrl(urlInput)) {
            return NextResponse.json(await getYoutubeResult(urlInput));
        }

        return NextResponse.json({
            results: [
                {
                    name: urlInput,
                    url: urlInput,
                    videoUrl: urlInput,
                    similarity: 1,
                },
            ],
        });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

async function getYoutubeResult(urlInput) {
    const videoId = extractYoutubeVideoId(urlInput);
    const videoUrl = videoId
        ? `https://www.youtube.com/embed/${videoId}`
        : urlInput;

    let name = "YouTube video";
    try {
        const oEmbedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(urlInput)}&format=json`;
        const response = await fetch(oEmbedUrl);
        if (response.ok) {
            const data = await response.json();
            name = data.title || name;
        }
    } catch {
        // Best-effort title lookup only; the source URL is still usable.
    }

    return {
        results: [
            {
                name,
                url: urlInput,
                videoUrl,
                similarity: 1,
                isYouTube: true,
                fromExternalChannel: true,
            },
        ],
    };
}

function isYoutubeUrl(urlInput) {
    try {
        const url = new URL(urlInput);
        return ["youtube.com", "www.youtube.com", "youtu.be"].includes(
            url.hostname,
        );
    } catch {
        return false;
    }
}

function extractYoutubeVideoId(urlInput) {
    try {
        const url = new URL(urlInput);
        if (url.hostname === "youtu.be") {
            return url.pathname.slice(1) || null;
        }
        return url.searchParams.get("v");
    } catch {
        return null;
    }
}
