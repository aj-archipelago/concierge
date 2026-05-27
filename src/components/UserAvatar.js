"use client";

import React, { useEffect, useMemo, useState } from "react";
import { User as UserIcon } from "lucide-react";
import { ImageWithFallback } from "./chat/MediaCard";
import { normalizeProfilePictureUrl } from "../utils/profilePictureUrl";

function deriveInitials(value = "") {
    const parts = String(value).trim().split(/\s+/).filter(Boolean);

    if (!parts.length) return "";

    return parts
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() || "")
        .join("");
}

export default function UserAvatar({
    src,
    blobPath,
    contextId,
    name,
    initials,
    className,
    imageClassName = "h-full w-full object-cover",
    initialsClassName = "",
    iconClassName = "h-1/2 w-1/2",
}) {
    const resolvedSrc = useMemo(() => {
        return normalizeProfilePictureUrl(src, { blobPath, contextId });
    }, [src, blobPath, contextId]);
    const resolvedInitials = initials || deriveInitials(name);
    const [hasError, setHasError] = useState(false);

    useEffect(() => {
        setHasError(false);
    }, [resolvedSrc]);

    return (
        <div
            className={[
                "flex items-center justify-center overflow-hidden",
                className,
            ]
                .filter(Boolean)
                .join(" ")}
            aria-label={name || "User"}
            title={name || "User"}
        >
            {resolvedSrc && !hasError ? (
                <ImageWithFallback
                    src={resolvedSrc}
                    alt={name || "User"}
                    className={imageClassName}
                    onError={() => setHasError(true)}
                />
            ) : resolvedInitials ? (
                <span className={initialsClassName}>{resolvedInitials}</span>
            ) : (
                <UserIcon className={iconClassName} />
            )}
        </div>
    );
}
