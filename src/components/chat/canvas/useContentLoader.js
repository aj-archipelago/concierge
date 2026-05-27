"use client";

import { useState, useEffect, useCallback } from "react";
import { getTextProxyUrl } from "../../../utils/proxyUrl";

/**
 * Hook for loading content from a URL or inline source.
 * Handles loading state, error state, retry, and inline content updates.
 *
 * Used by HtmlPreviewTabContent and other canvas tabs that fetch or receive content.
 *
 * @param {Object} options
 * @param {string|null} options.url - URL to fetch (when no inlineContent)
 * @param {string|null} options.inlineContent - Pre-loaded content (takes precedence)
 * @param {boolean} options.isActive - Only fetch when tab is active
 * @param {string} [options.emptyError] - Error message when neither url nor inlineContent
 * @returns {{ loading: boolean, error: string|null, content: string|null, contentKey: number, retry: () => void }}
 */
export function useContentLoader({
    url,
    inlineContent,
    isActive = true,
    emptyError = "No URL provided",
}) {
    const [content, setContentState] = useState(inlineContent ?? null);
    const [contentKey, setContentKey] = useState(0);
    const [loading, setLoading] = useState(!inlineContent);
    const [error, setError] = useState(null);

    const bumpContentKey = useCallback(() => {
        setContentKey((k) => k + 1);
    }, []);

    const loadContent = useCallback(async () => {
        if (!url) {
            if (!inlineContent) {
                setError(emptyError);
            }
            setLoading(false);
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const fetchUrl = getTextProxyUrl(url);
            const response = await fetch(fetchUrl);
            if (!response.ok) {
                throw new Error(`Failed to load: ${response.statusText}`);
            }
            const text = await response.text();
            setContentState(text);
            bumpContentKey();
        } catch (err) {
            setError(err.message || "Failed to load");
        } finally {
            setLoading(false);
        }
    }, [url, inlineContent, emptyError, bumpContentKey]);

    // Use inline content when provided
    useEffect(() => {
        if (inlineContent) {
            setContentState(inlineContent);
            bumpContentKey();
            setLoading(false);
            setError(null);
        }
    }, [inlineContent, bumpContentKey]);

    // Fetch from URL when active and no inline content
    useEffect(() => {
        if (url && isActive && !inlineContent) {
            loadContent();
        }
    }, [url, isActive, inlineContent, loadContent]);

    return {
        loading,
        error,
        content,
        contentKey,
        retry: loadContent,
    };
}
