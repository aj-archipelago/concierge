"use client";

import { createSlice, current } from "@reduxjs/toolkit";

export const docSlice = createSlice({
    name: "doc",
    initialState: {
        docs:
            typeof localStorage !== "undefined"
                ? JSON.parse(localStorage.getItem("docs")) || []
                : null,
        selectedSources:
            typeof localStorage !== "undefined"
                ? JSON.parse(localStorage.getItem("selectedSources")) || []
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
        addSource: (state, action) => {
            if (!state.selectedSources.includes(action.payload)) {
                state.selectedSources.push(action.payload);
            }
            localStorage.setItem(
                "selectedSources",
                JSON.stringify(current(state).selectedSources),
            );
        },
        removeSource: (state, action) => {
            const index = state.selectedSources.indexOf(action.payload);
            if (index !== -1) {
                state.selectedSources.splice(index, 1);
            }
            localStorage.setItem(
                "selectedSources",
                JSON.stringify(current(state).selectedSources),
            );
        },
    },
});

export const { addDoc, removeDoc, removeDocs, addSource, removeSource } =
    docSlice.actions;

export default docSlice.reducer;
