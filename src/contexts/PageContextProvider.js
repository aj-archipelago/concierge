"use client";

import React, {
    createContext,
    useContext,
    useState,
    useCallback,
    useEffect,
    useMemo,
    useRef,
} from "react";
import { usePathname } from "next/navigation";

const PageContextContext = createContext({
    contextualTools: [],
    pageContext: null,
    pageContextGetter: null, // Function to get context on-demand
    toolHandlers: {},
    modelOverride: null, // Model override for the page
    setPageContext: () => {},
    clearPageContext: () => {},
    setModelOverride: () => {},
});

export function PageContextProvider({ children }) {
    const [contextEntries, setContextEntries] = useState({});
    const [modelOverride, setModelOverride] = useState(null);

    const pathname = usePathname();
    const pathnameRef = useRef(pathname);

    useEffect(() => {
        if (pathnameRef.current !== pathname) {
            pathnameRef.current = pathname;
            setModelOverride(null);
        }
    }, [pathname]);

    const setPageContext = useCallback(
        (
            tools,
            context,
            handlers = {},
            contextGetter = null,
            source = "default",
        ) => {
            setContextEntries((current) => ({
                ...current,
                [source]: {
                    tools: tools || [],
                    context: context || null,
                    contextGetter: contextGetter || null,
                    handlers: handlers || {},
                    pathname,
                },
            }));
        },
        [pathname],
    );

    const clearPageContext = useCallback((source = "default") => {
        setContextEntries((current) => {
            if (!current[source]) {
                return current;
            }

            const next = { ...current };
            delete next[source];
            return next;
        });
    }, []);

    const { contextualTools, pageContext, pageContextGetter, toolHandlers } =
        useMemo(() => {
            const activeEntries = Object.values(contextEntries).filter(
                (entry) => entry?.pathname === pathname,
            );

            const mergedTools = activeEntries.flatMap(
                (entry) => entry.tools || [],
            );
            const mergedHandlers = activeEntries.reduce((acc, entry) => {
                Object.assign(acc, entry.handlers || {});
                return acc;
            }, {});

            let resolvedPageContext = null;
            let resolvedPageContextGetter = null;

            for (const entry of activeEntries) {
                if (entry.context !== null) {
                    resolvedPageContext = entry.context;
                }
                if (entry.contextGetter) {
                    resolvedPageContextGetter = entry.contextGetter;
                }
            }

            return {
                contextualTools: mergedTools,
                pageContext: resolvedPageContext,
                pageContextGetter: resolvedPageContextGetter,
                toolHandlers: mergedHandlers,
            };
        }, [contextEntries, pathname]);

    return (
        <PageContextContext.Provider
            value={{
                contextualTools,
                pageContext,
                pageContextGetter, // Include getter function
                toolHandlers,
                modelOverride,
                setPageContext,
                setModelOverride,
                clearPageContext,
            }}
        >
            {children}
        </PageContextContext.Provider>
    );
}

export function usePageContext() {
    return useContext(PageContextContext);
}
