import { NextResponse } from "next/server";

export async function GET(req) {
    try {
        const url = new URL(req.url);
        const youtubeInput =
            url.searchParams.get("youtubeInput") ||
            url.searchParams.get("youtubeURL") ||
            url.searchParams.get("url");

        if (!youtubeInput) {
            return NextResponse.json(
                { error: "No YouTube URL provided" },
                { status: 400 },
            );
        }

        const oEmbedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(youtubeInput)}&format=json`;
        const response = await fetch(oEmbedUrl);
        const data = await response.json();
        const title = data.title;

        const channelId = data.author_url.split("@").pop();
        let accountId;

        if (channelId === "aljazeeraenglish") {
            accountId = "665003303001"; // AJE
        } else if (channelId === "aljazeera") {
            accountId = "665001584001"; // AJA
        } else {
            return NextResponse.json(
                { error: "Unsupported YouTube channel" },
                { status: 400 },
            );
        }

        const axisUrl = `https://axis.aljazeera.net/brightcove/playback/media/v1.0/${accountId}/videos?format=json&q=${encodeURIComponent(title)}`;
        const axisResponse = await fetch(axisUrl);
        const axisData = await axisResponse.json();

        const SIMILARITY_THRESHOLD = 0.5;

        const mostSimilarItem = findMostSimilarTitle(
            axisData.items,
            data.title,
        );
        if (
            mostSimilarItem &&
            mostSimilarItem.similarity > SIMILARITY_THRESHOLD
        ) {
            const { item } = mostSimilarItem;
            const url = getBestRenditionForTranscription(item);
            const videoUrl = getBestQualityRendition(item);
            return NextResponse.json({ title, name: item.name, url, videoUrl });
        } else {
            return NextResponse.json(
                { error: "No matching video found" },
                { status: 404 },
            );
        }
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

function findMostSimilarTitle(items, targetTitle) {
    return items.reduce(
        (best, current) => {
            const similarity = calculateSimilarity(targetTitle, current.name);
            return similarity > best.similarity
                ? { item: current, similarity }
                : best;
        },
        { item: null, similarity: 0 },
    );
}

function calculateSimilarity(str1, str2) {
    const set1 = new Set(str1.toLowerCase().split(" "));
    const set2 = new Set(str2.toLowerCase().split(" "));
    const intersection = new Set([...set1].filter((x) => set2.has(x)));
    return intersection.size / Math.max(set1.size, set2.size);
}

function getBestRenditionForTranscription(videoData) {
    const audioRendition = videoData.renditions.find((r) => r.audioOnly);
    if (audioRendition) return audioRendition.url;

    const videoRenditions = videoData.renditions.filter((r) => !r.audioOnly);
    if (videoRenditions.length > 0) {
        return videoRenditions.reduce((best, current) =>
            current.encodingRate < best.encodingRate ? current : best,
        ).url;
    }

    return videoData.FLVURL || null;
}

function getBestQualityRendition(videoData) {
    return videoData.renditions.reduce((best, current) =>
        current.encodingRate > best.encodingRate ? current : best,
    ).url;
}
