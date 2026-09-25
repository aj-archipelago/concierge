"use client";
import { createContext, useContext, useEffect, useRef, useState } from "react";
const CurrentEntityContext = createContext({
    target: null,
    setTargets: () => {},
});
export function CurrentEntityProvider({ children }) {
    const [targets, setTargets] = useState([]);
    const target = targets.reduce(
        (chosen, next) =>
            !chosen || next.priority >= chosen.priority ? next : chosen,
        null,
    );
    return (
        <CurrentEntityContext.Provider value={{ target, setTargets }}>
            {children}
        </CurrentEntityContext.Provider>
    );
}
export function useCurrentEntityTarget(entityId, priority = 0) {
    const { setTargets } = useContext(CurrentEntityContext);
    const token = useRef(Symbol("entity-surface"));
    useEffect(() => {
        if (!entityId) return;
        const owner = token.current;
        setTargets((current) => [
            ...current.filter((t) => t.owner !== owner),
            { entityId, owner, priority },
        ]);
        return () =>
            setTargets((current) => current.filter((t) => t.owner !== owner));
    }, [entityId, priority, setTargets]);
}
export function useCurrentEntityId() {
    return useContext(CurrentEntityContext).target?.entityId;
}
