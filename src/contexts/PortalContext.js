"use client";

import { createContext, useContext } from "react";

export const PortalContext = createContext({
    openPortal: (_tab) => {},
    closePortal: () => {},
});

export function usePortal() {
    return useContext(PortalContext);
}
