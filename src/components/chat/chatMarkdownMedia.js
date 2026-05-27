"use client";

import React from "react";
import i18next from "i18next";
import MediaCard from "./MediaCard";
import { isVideoUrl, isImageUrl } from "../../utils/mediaUtils";
import { getYoutubeEmbedUrl } from "../../utils/urlUtils";

export function getMarkdownMediaFilename(src, alt) {
    let filename = alt || "Image";
    try {
        if (src && !filename.includes("Image")) {
            const url = new URL(src);
            const pathname = url.pathname;
            const urlFilename = pathname.split("/").pop();
            if (urlFilename && urlFilename.includes(".")) {
                filename = decodeURIComponent(urlFilename);
            } else if (alt) {
                filename = alt;
            }
        }
    } catch (e) {
        filename = alt || "Image";
    }

    return filename;
}

export const MarkdownImageRenderer = React.memo(function MarkdownImageRenderer({
    src,
    alt,
}) {
    const filename = getMarkdownMediaFilename(src, alt);
    const t = i18next.t.bind(i18next);

    if (isVideoUrl(src)) {
        const youtubeEmbedUrl = getYoutubeEmbedUrl(src);
        if (youtubeEmbedUrl) {
            return (
                <MediaCard
                    type="youtube"
                    src={src}
                    filename={filename}
                    youtubeEmbedUrl={youtubeEmbedUrl}
                    className="my-2"
                    t={t}
                />
            );
        }

        return (
            <MediaCard
                type="video"
                src={src}
                filename={filename}
                className="my-2"
                t={t}
            />
        );
    }

    const fileType = isImageUrl(src) || isImageUrl(filename) ? "image" : "file";

    return (
        <MediaCard
            type={fileType}
            src={src}
            filename={filename}
            className="my-2"
            t={t}
        />
    );
});
