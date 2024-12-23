import crypto from "crypto";

export async function hashMediaFile(file) {
    const hash = crypto.createHash("sha256");
    const chunkSize = 512 * 1024;
    const numOfChunks = Math.ceil(file.size / chunkSize);
    const reader = new FileReader();

    async function processChunk(index) {
        const start = index * chunkSize;
        const end = start + chunkSize;
        const blobSlice = file.slice(start, end);

        return new Promise((resolve, reject) => {
            reader.onload = (event) => {
                const arrayBuffer = event.target.result;
                const array = new Uint8Array(arrayBuffer);
                array.forEach((chunk) => {
                    hash.update(new Uint8Array([chunk]));
                });
                resolve();
            };
            reader.onerror = reject;
            reader.readAsArrayBuffer(blobSlice);
        });
    }

    for (let i = 0; i < numOfChunks; i++) {
        await processChunk(i);
    }
    return hash.digest("hex");
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
