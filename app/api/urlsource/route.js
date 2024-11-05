import { NextResponse } from "next/server";
import {
    AJE,
    AJA,
    getAxisUrl,
} from "../../../app.config/config/transcribe/TranscribeUrlConstants";

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

        const axisUrl = getAxisUrl(accountId, searchQuery);
        const axisResponse = await fetch(axisUrl);
        const axisData = await axisResponse.json();

        const SIMILARITY_THRESHOLD = 0.1;
        const MAX_RESULTS = 5; // Return up to 5 similar videos

        // Find multiple similar items instead of just one
        const similarItems = axisData.items
            .map(item => ({
                item,
                similarity: calculateSimilarity(searchQuery, item.name)
            }))
            .filter(result => result.similarity > SIMILARITY_THRESHOLD)
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, MAX_RESULTS);

        if (similarItems.length > 0) {
            const results = similarItems.map(({ item }) => ({
                title: searchQuery,
                name: item.name,
                url: getBestRenditionForTranscription(item),
                videoUrl: getBestQualityRendition(item),
                similarity: calculateSimilarity(searchQuery, item.name)
            }));

            return NextResponse.json({ results });
        } else {
            return NextResponse.json(
                { error: "No matching videos found" },
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
