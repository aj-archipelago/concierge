import xxhash from "xxhash-wasm";
import mime from "mime-types";
import { isYoutubeUrl } from "./urlUtils";

let xxhashInstance = null;

// Initialize xxhash once and reuse the instance
async function getXXHashInstance() {
    if (!xxhashInstance) {
        xxhashInstance = await xxhash();
    }
    return xxhashInstance;
}

// RAG File Type Extensions
export const RAG_EXTENSIONS = [
];

// File type definitions
export const DOC_EXTENSIONS = [
    ".pdf",
    ".txt",
    ".csv",
    ".json",
    ".md",
    ".xml",
    ".js",
    ".html",
    ".css",
    ".docx",
    ".xlsx",
    ".xls",
    ".doc",
    ".heic",
    ".heif",
];

export const IMAGE_EXTENSIONS = [
    ".jpg",
    ".jpeg",
    ".png",
    ".webp",
    ".gif",
    ".bmp",
    ".tiff",
];

export const VIDEO_EXTENSIONS = [
    ".mp4",
    ".mpeg",
    ".mov",
    ".avi",
    ".flv",
    ".mpg",
    ".webm",
    ".wmv",
    ".3gp",
];

export const AUDIO_EXTENSIONS = [
    ".wav",
    ".mp3",
    ".m4a",
    ".aac",
    ".ogg",
    ".flac",
];

export const RAG_MIME_TYPES = RAG_EXTENSIONS.map((ext) => mime.lookup(ext));
export const DOC_MIME_TYPES = DOC_EXTENSIONS.map((ext) => mime.lookup(ext));
export const IMAGE_MIME_TYPES = IMAGE_EXTENSIONS.map((ext) => mime.lookup(ext));
export const VIDEO_MIME_TYPES = VIDEO_EXTENSIONS.map((ext) => mime.lookup(ext));
VIDEO_MIME_TYPES.push("video/youtube");
export const AUDIO_MIME_TYPES = AUDIO_EXTENSIONS.map((ext) => mime.lookup(ext));

export const MEDIA_MIME_TYPES = [
    ...VIDEO_MIME_TYPES,
    ...AUDIO_MIME_TYPES,
];

export const ACCEPTED_FILE_TYPES = [...DOC_MIME_TYPES, ...IMAGE_MIME_TYPES, ...VIDEO_MIME_TYPES, ...AUDIO_MIME_TYPES];

// File type utilities
export function getExtension(url) {
    if (!url) return "";
    const filename = url.split("?")[0].split("#")[0];
    const lastDotIndex = filename.lastIndexOf(".");
    return lastDotIndex > 0 ? filename.slice(lastDotIndex).toLowerCase() : "";
}

export function isRagFileUrl(url) {
    const urlExt = getExtension(url);
    console.log("urlExt", urlExt);
    console.log("RAG_EXTENSIONS", RAG_EXTENSIONS);
    return RAG_EXTENSIONS.includes(urlExt);
}

export function isDocumentUrl(url) {
    const urlExt = getExtension(url);
    return DOC_EXTENSIONS.includes(urlExt);
}

export function isImageUrl(url) {
    const urlExt = getExtension(url);
    const mimeType = mime.contentType(urlExt);
    return (
        IMAGE_EXTENSIONS.includes(urlExt) &&
        (mimeType.startsWith("image/") ||
            mimeType === "application/pdf" ||
            mimeType.startsWith("text/"))
    );
}

export function isVideoUrl(url) {
    // Check if it's a YouTube URL first
    if (isYoutubeUrl(url)) {
        return true;
    }
    const urlExt = getExtension(url);
    const mimeType = mime.contentType(urlExt);
    return VIDEO_EXTENSIONS.includes(urlExt) && mimeType.startsWith("video/");
}

export function isAudioUrl(url) {
    const urlExt = getExtension(url);
    const mimeType = mime.contentType(urlExt);
    return AUDIO_EXTENSIONS.includes(urlExt) && mimeType.startsWith("audio/");
}

export function isMediaUrl(url) {
    return isImageUrl(url) || isVideoUrl(url) || isAudioUrl(url);
}

export function isSupportedFileUrl(url) {
    return isDocumentUrl(url) || isMediaUrl(url);
}

export function getYoutubeVideoId(url) {
    try {
        const urlObj = new URL(url);
        // Handle youtu.be URLs
        if (urlObj.hostname === "youtu.be") {
            return urlObj.pathname.substring(1).split("?")[0];
        }
        // Handle youtube.com URLs
        if (
            urlObj.hostname === "youtube.com" ||
            urlObj.hostname === "www.youtube.com"
        ) {
            return urlObj.searchParams.get("v");
        }
        return null;
    } catch (err) {
        return null;
    }
}

// Extracts the filename from a URL
export function getFilename(url) {
    try {
        // Special handling for YouTube URLs
        if (isYoutubeUrl(url)) {
            const videoId = getYoutubeVideoId(url);
            return videoId ? `youtube-video-${videoId}` : "youtube-video";
        }

        // Create a URL object to handle parsing
        const urlObject = new URL(url);

        // Get the pathname and remove leading/trailing slashes
        const path = urlObject.pathname.replace(/^\/|\/$/g, "");

        // Get the last part of the path (filename)
        const fullFilename = path.split("/").pop() || "";

        // Decode the filename to handle URL encoding
        const decodedFilename = decodeURIComponent(fullFilename);

        // Split by underscore and remove the first part if it exists
        const parts = decodedFilename.split("_");
        const relevantParts = parts.length > 1 ? parts.slice(1) : parts;

        // Join the parts back together
        return relevantParts.join("_");
    } catch (error) {
        console.error("Error parsing URL:", error);
        return "";
    }
}

// Media file utilities
export async function hashMediaFile(file) {
    const hasher = await getXXHashInstance();
    const xxh64 = hasher.create64();

    const stream = file.stream();
    const reader = stream.getReader();

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            xxh64.update(value);
        }
        return xxh64.digest().toString(16);
    } finally {
        reader.releaseLock();
    }
}

export const getVideoDuration = (file) => {
    return new Promise((resolve, reject) => {
        const video = document.createElement("video");
        video.preload = "metadata";
        video.onloadedmetadata = () => resolve(video.duration);
        video.onerror = reject;
        video.src = URL.createObjectURL(file);
    });
};

export const getVideoDurationFromUrl = (url) => {
    return new Promise((resolve, reject) => {
        const video = document.createElement("video");
        video.preload = "metadata";
        video.src = url;
        video.onloadedmetadata = () => resolve(video.duration);
        video.onerror = reject;
    });
};
