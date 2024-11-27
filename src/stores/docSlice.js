"use client";

import { createSlice, current } from "@reduxjs/toolkit";

export const docSlice = createSlice({
    name: "doc",
    initialState: {
        docs:
            typeof localStorage !== "undefined"
                ? JSON.parse(localStorage.getItem("docs")) || []
                : null,
    },
    reducers: {
        addDoc: (state, action) => {
            state.docs.unshift(action.payload);
            localStorage.setItem("docs", JSON.stringify(current(state).docs));
        },
        removeDoc: (state, action) => {
            const index = state.docs.findIndex(
                (doc) => doc.docId === action.payload,
            );
            if (index !== -1) {
                state.docs.splice(index, 1);
            }
            localStorage.setItem("docs", JSON.stringify(current(state).docs));
        },
        removeDocs: (state) => {
            state.docs = [];
            localStorage.removeItem("docs");
        },
    },
});

export default docSlice.reducer;
