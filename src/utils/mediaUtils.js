import xxhash from "xxhash-wasm";

let xxhashInstance = null;

// Initialize xxhash once and reuse the instance
async function getXXHashInstance() {
    if (!xxhashInstance) {
        xxhashInstance = await xxhash();
    }
    return xxhashInstance;
}

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
