"use client";

import { createContext, useContext, useLayoutEffect } from "react";
import { createPortal } from "react-dom";

export const AppHeaderContext = createContext(null);

export function useAppHeader() {
    return useContext(AppHeaderContext);
}

// Keep page state and React context with the page while hosting its controls
// in the app shell. Embedded views can opt out and retain an inline header.
export function AppHeaderPortal({ children, enabled = true }) {
    const header = useAppHeader();
    const register = enabled ? header?.register : null;
    useLayoutEffect(() => register?.(), [register]);
    if (!enabled || !header) return children;
    return header.target ? createPortal(children, header.target) : null;
}
