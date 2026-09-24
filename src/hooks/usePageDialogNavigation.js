"use client";

import { useCallback, useEffect, useRef, useState } from "react";

function publicHistoryState() {
    // Next copies its router metadata itself when using the native History API.
    return Object.fromEntries(
        Object.entries(window.history.state || {}).filter(
            ([key]) =>
                key !== "__NA" &&
                key !== "_N" &&
                !key.startsWith("__PRIVATE_NEXTJS") &&
                key !== "conciergeHomeView" &&
                key !== "conciergeDialog",
        ),
    );
}

export default function usePageDialogNavigation({
    viewParam = "dialog",
    itemParam = "dialogItem",
} = {}) {
    const owner = useRef(`${Date.now()}-${Math.random()}`);
    const [current, setCurrent] = useState({ view: null, itemId: null });
    const readView = useCallback(() => {
        const params = new URLSearchParams(window.location.search);
        return { view: params.get(viewParam), itemId: params.get(itemParam) };
    }, [viewParam, itemParam]);
    useEffect(() => {
        const sync = () => setCurrent(readView());
        sync();
        window.addEventListener("popstate", sync);
        return () => window.removeEventListener("popstate", sync);
    }, [readView]);

    const open = useCallback(
        (view, itemId = null) => {
            const url = new URL(window.location.href);
            const replacing = Boolean(url.searchParams.get(viewParam));
            const previous = window.history.state?.conciergeDialog;
            const owned =
                previous?.owner === owner.current &&
                previous?.param === viewParam;
            url.searchParams.set(viewParam, view);
            if (itemId) url.searchParams.set(itemParam, itemId);
            else url.searchParams.delete(itemParam);
            window.history[replacing ? "replaceState" : "pushState"](
                {
                    ...publicHistoryState(),
                    conciergeDialog:
                        !replacing || owned
                            ? {
                                  owner: owner.current,
                                  param: viewParam,
                                  pathname: url.pathname,
                              }
                            : null,
                },
                "",
                url.pathname + url.search + url.hash,
            );
            setCurrent({ view, itemId });
        },
        [viewParam, itemParam],
    );

    const close = useCallback(
        ({ traverse = true } = {}) => {
            const url = new URL(window.location.href);
            const hadView = Boolean(url.searchParams.get(viewParam));
            const entry = window.history.state?.conciergeDialog;
            const canGoBack =
                hadView &&
                entry?.owner === owner.current &&
                entry?.param === viewParam &&
                entry?.pathname === url.pathname;
            url.searchParams.delete(viewParam);
            url.searchParams.delete(itemParam);
            // Dismiss and clean the URL immediately. Closing must never depend on
            // popstate arriving; stale or restored entries may have no predecessor.
            setCurrent({ view: null, itemId: null });
            if (hadView)
                window.history.replaceState(
                    publicHistoryState(),
                    "",
                    url.pathname + url.search + url.hash,
                );
            // Only traverse entries this mounted page created from its base view.
            // Clear the marker first so duplicate callbacks cannot navigate twice.
            if (canGoBack && traverse) window.history.back();
        },
        [viewParam, itemParam],
    );

    return { ...current, open, close };
}
