"use client";

import { createSlice, current } from "@reduxjs/toolkit";

const getSafeLocalStorage = () => {
    if (typeof localStorage === "undefined") return null;
    try {
        if (!localStorage || typeof localStorage.getItem !== "function") {
            return null;
        }
        return localStorage;
    } catch (error) {
        return null;
    }
};

export const docSlice = createSlice({
    name: "doc",
    initialState: {
        docs: (() => {
            const storage = getSafeLocalStorage();
            if (!storage) return null;
            try {
                return JSON.parse(storage.getItem("docs")) || [];
            } catch (error) {
                return [];
            }
        })(),
    },
    reducers: {
        addDoc: (state, action) => {
            state.docs.unshift(action.payload);
            const storage = getSafeLocalStorage();
            if (!storage) return;
            storage.setItem("docs", JSON.stringify(current(state).docs));
        },
        removeDoc: (state, action) => {
            const index = state.docs.findIndex(
                (doc) => doc.docId === action.payload,
            );
            if (index !== -1) {
                state.docs.splice(index, 1);
            }
            const storage = getSafeLocalStorage();
            if (!storage) return;
            storage.setItem("docs", JSON.stringify(current(state).docs));
        },
        removeDocs: (state) => {
            state.docs = [];
            const storage = getSafeLocalStorage();
            if (!storage) return;
            storage.removeItem("docs");
        },
    },
});

export default docSlice.reducer;
