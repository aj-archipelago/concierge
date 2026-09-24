"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { getTextProxyUrl } from "../../../utils/proxyUrl";

/** Load active canvas content, retaining its identity across retries and races. */
export function useContentLoader({
    url,
    fileHash,
    inlineContent,
    isActive = true,
    emptyError = "No content available",
    failureError = "Could not load content",
    fetchOptions,
    reloadKey,
}) {
    const source = JSON.stringify([url || null, fileHash || null]);
    const [state, setState] = useState({
        source,
        content: inlineContent || null,
        loading: !inlineContent && !!(url || fileHash),
        error: null,
        contentKey: 0,
    });
    const requestRef = useRef(null);

    const loadContent = useCallback(async () => {
        requestRef.current?.abort();
        const controller = new AbortController();
        requestRef.current = controller;
        const current = () =>
            requestRef.current === controller && !controller.signal.aborted;
        const commit = (content, error = null) => {
            if (!current()) return;
            setState((previous) => ({
                source,
                content,
                error,
                loading: false,
                contentKey:
                    previous.contentKey +
                    Number(
                        previous.source !== source ||
                            previous.content !== content,
                    ),
            }));
        };
        if (inlineContent) {
            commit(inlineContent);
            return;
        }
        if (!url && !fileHash) {
            commit(null, emptyError);
            return;
        }
        setState((previous) => ({
            ...previous,
            source,
            content: previous.source === source ? previous.content : null,
            loading: true,
            error: null,
        }));
        try {
            let resolvedUrl = url;
            // Legacy saved tabs may have only a file hash. Resolve it under the
            // current user's authorization, without relying on an expired URL.
            if (!resolvedUrl && fileHash) {
                const lookup = await fetch("/api/files/check-url", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ hash: fileHash }),
                    signal: controller.signal,
                });
                if (!lookup.ok) throw new Error(failureError);
                const resolved = await lookup.json();
                if (!resolved.exists || !resolved.file?.url)
                    throw new Error(failureError);
                resolvedUrl = resolved.file.url;
            }
            if (!current()) return;
            const response = await fetch(
                getTextProxyUrl(resolvedUrl, { refresh: true }),
                {
                    ...fetchOptions,
                    signal: controller.signal,
                },
            );
            if (!response.ok) throw new Error(failureError);
            const text = await response.text();
            if (!text.trim()) throw new Error(failureError);
            commit(text);
        } catch {
            // Abort/obsolete completions must not replace a newer preview or
            // leak raw network errors (including signed URLs) into the UI.
            if (current()) commit(null, failureError);
        }
    }, [
        source,
        url,
        fileHash,
        inlineContent,
        emptyError,
        failureError,
        fetchOptions,
    ]);

    useEffect(() => {
        if (inlineContent || (!url && !fileHash) || isActive) loadContent();
        return () => requestRef.current?.abort();
    }, [loadContent, isActive, reloadKey, inlineContent, url, fileHash]);

    const matchesSource = state.source === source;
    return {
        loading: matchesSource
            ? state.loading
            : !!(isActive && (url || fileHash)),
        error: matchesSource ? state.error : null,
        content: matchesSource ? state.content : null,
        contentKey: state.contentKey,
        retry: loadContent,
    };
}
