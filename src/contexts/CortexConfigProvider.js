import React from "react";
import config from "../../config";

export const CortexConfigContext = React.createContext();

export function CortexConfigProvider({ children }) {
    return (
        <CortexConfigContext.Provider value={config}>
            {children}
        </CortexConfigContext.Provider>
    );
}
