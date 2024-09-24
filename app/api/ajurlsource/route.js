import { NextResponse } from "next/server";

const AJE = "665003303001";
const AJA = "665001584001";

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

        let searchQuery = urlInput;
        let accountId = AJE; // AJE, AJA, etc.

        //check if url is a valid youtube url
        const youtubeRegex =
            /^(https?\:\/\/)?(www\.)?(youtube\.com|youtu\.?be)\/.+$/;
        if (youtubeRegex.test(urlInput)) {
            const oEmbedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(urlInput)}&format=json`;
            const response = await fetch(oEmbedUrl);
            const data = await response.json();
            searchQuery = data.title;

            const channelId = data.author_url.split("@").pop();

            if (channelId === "aljazeeraenglish") {
                accountId = AJE;
            } else if (channelId === "aljazeera") {
                accountId = AJA;
            } else {
                return NextResponse.json(
                    { error: "Unsupported YouTube channel" },
                    { status: 400 },
                );
            }
        } else {
            //check if searchQuery has arabic characters
            const arabicRegex = /[\u0600-\u06FF]/;
            if (arabicRegex.test(searchQuery)) {
                accountId = AJA;
            }
        }

        const axisUrl = `https://axis.aljazeera.net/brightcove/playback/media/v1.0/${accountId}/videos?format=json&q=${encodeURIComponent(searchQuery)}`;
        const axisResponse = await fetch(axisUrl);
        const axisData = await axisResponse.json();

        const SIMILARITY_THRESHOLD = 0.1;

        const mostSimilarItem = findMostSimilarTitle(
            axisData.items,
            searchQuery,
        );
        if (
            mostSimilarItem &&
            mostSimilarItem.similarity > SIMILARITY_THRESHOLD
        ) {
            const { item } = mostSimilarItem;
            const url = getBestRenditionForTranscription(item);
            const videoUrl = getBestQualityRendition(item);
            return NextResponse.json({
                title: searchQuery,
                name: item.name,
                url,
                videoUrl,
            });
        } else {
            return NextResponse.json(
                { error: "No matching video found" },
                // { status: 404 },
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
