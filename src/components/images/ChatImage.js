"use client";

import React, { useEffect, useRef } from "react";
import {
    getStableImageId,
    tempToPermanentUrlMap,
} from "../../utils/imageUtils.mjs";

const ChatImage = React.memo(
    function ChatImage({
        node,
        src,
        alt = "",
        className = "max-h-[20%] max-w-[60%] [.docked_&]:max-w-[90%] rounded my-2 shadow-lg dark:shadow-black/30",
        style = {},
        onLoad,
        ...props
    }) {
        // Check if we have a permanent URL for this temporary URL
        const permanentUrl = tempToPermanentUrlMap.get(src);
        const bestSrc = permanentUrl || src;

        // Get a stable ID that persists even when the URL changes from temp to permanent
        const stableId = getStableImageId(src, node);

        // Track current src and use a loading ref to prevent flashing
        const [currentSrc, setCurrentSrc] = React.useState(bestSrc);
        const isLoadingNewSrc = useRef(false);
        const previousSrcRef = useRef(bestSrc);

        // Handle URL changes by preloading the new image
        useEffect(() => {
            // If the best source URL has changed
            if (bestSrc !== previousSrcRef.current) {
                // If we already have the image preloaded (from processImageUrls)
                // we can switch immediately
                if (tempToPermanentUrlMap.has(previousSrcRef.current)) {
                    setCurrentSrc(bestSrc);
                } else {
                    // Otherwise, preload the new image before switching
                    isLoadingNewSrc.current = true; // Track that we're loading a new image

                    const img = new Image();
                    img.onload = () => {
                        // Only switch once the new image is loaded
                        setCurrentSrc(bestSrc);
                        isLoadingNewSrc.current = false;
                    };
                    img.onerror = () => {
                        // If there's an error, still swap to avoid getting stuck
                        setCurrentSrc(bestSrc);
                        isLoadingNewSrc.current = false;
                    };
                    img.src = bestSrc;
                }
            }

            // Update the ref for the next comparison
            previousSrcRef.current = bestSrc;
        }, [bestSrc]);

        // Also handle direct src prop changes (fallback)
        useEffect(() => {
            if (src !== previousSrcRef.current && !permanentUrl) {
                // For direct src changes, also preload
                isLoadingNewSrc.current = true;

                const img = new Image();
                img.onload = () => {
                    setCurrentSrc(src);
                    isLoadingNewSrc.current = false;
                };
                img.onerror = () => {
                    setCurrentSrc(src);
                    isLoadingNewSrc.current = false;
                };
                img.src = src;

                previousSrcRef.current = src;
            }
        }, [src, permanentUrl]);

        return (
            <img
                key={stableId}
                src={currentSrc}
                alt={alt}
                className={className}
                style={{
                    backgroundColor: "transparent",
                    border: "none",
                    outline: "none",
                    ...style,
                }}
                onLoad={onLoad}
                {...props}
            />
        );
    },
    (prevProps, nextProps) => {
        // Only re-render if src, alt, or node changes
        // Note: The component will still handle src changes internally via useEffect
        return (
            prevProps.src === nextProps.src &&
            prevProps.alt === nextProps.alt &&
            prevProps.node === nextProps.node
        );
    },
);

export default ChatImage;
