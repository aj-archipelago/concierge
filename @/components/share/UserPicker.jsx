"use client";

import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { Search, Loader2 } from "lucide-react";
import UserAvatar from "../../../src/components/UserAvatar";
import { Input } from "@/components/ui/input";

export default function UserPicker({ onSelect, excludeIds = [], placeholder }) {
    const [query, setQuery] = useState("");
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const [open, setOpen] = useState(false);
    const debounceRef = useRef(null);
    const reqIdRef = useRef(0);
    const excludeSet = new Set(excludeIds.map(String));

    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        const trimmed = query.trim();
        if (trimmed.length < 2) {
            setResults([]);
            setLoading(false);
            return;
        }
        setLoading(true);
        debounceRef.current = setTimeout(async () => {
            const id = ++reqIdRef.current;
            try {
                const { data } = await axios.get("/api/users/search", {
                    params: { q: trimmed },
                });
                if (id !== reqIdRef.current) return;
                setResults(Array.isArray(data) ? data : []);
            } catch {
                if (id === reqIdRef.current) setResults([]);
            } finally {
                if (id === reqIdRef.current) setLoading(false);
            }
        }, 250);
        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, [query]);

    const visible = results.filter((u) => !excludeSet.has(String(u._id)));

    return (
        <div className="relative">
            <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <Input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onFocus={() => setOpen(true)}
                    onBlur={() => setTimeout(() => setOpen(false), 150)}
                    placeholder={
                        placeholder || "Search people by name or username"
                    }
                    className="pl-9"
                />
                {loading && (
                    <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-gray-400" />
                )}
            </div>
            {open && query.trim().length >= 2 && (
                <div className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-md border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800">
                    {visible.length === 0 && !loading ? (
                        <div className="px-3 py-2 text-sm text-gray-500">
                            No matches
                        </div>
                    ) : (
                        visible.map((u) => (
                            <button
                                key={u._id}
                                type="button"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => {
                                    onSelect?.(u);
                                    setQuery("");
                                    setResults([]);
                                    setOpen(false);
                                }}
                                className="flex w-full items-center gap-2 px-3 py-2 text-start text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
                            >
                                <UserAvatar
                                    src={u.profilePicture}
                                    name={u.name}
                                    className="h-7 w-7 flex-shrink-0 overflow-hidden rounded-full bg-gray-200 text-xs dark:bg-gray-700"
                                />
                                <div className="min-w-0 flex-1">
                                    <div className="truncate font-medium">
                                        {u.name}
                                    </div>
                                    <div className="truncate text-xs text-gray-500">
                                        {u.username}
                                    </div>
                                </div>
                            </button>
                        ))
                    )}
                </div>
            )}
        </div>
    );
}
