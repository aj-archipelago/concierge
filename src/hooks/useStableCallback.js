import { useRef, useCallback } from "react";

export function useStableCallback(fn) {
    const ref = useRef(fn);
    ref.current = fn;
    return useCallback((...args) => ref.current(...args), []);
}
