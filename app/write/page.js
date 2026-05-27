"use client";

import { useEffect, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useSearchParams } from "next/navigation";
import Chat from "../../src/components/chat/Chat";
import {
    openCanvas,
    closeCanvas,
    setCanvasVisibility,
} from "../../src/stores/chatSlice";

export default function Write() {
    const dispatch = useDispatch();
    const searchParams = useSearchParams();
    const canvasContent = useSelector((state) => state.chat?.canvasContent);
    const hasInitialized = useRef(false);

    useEffect(() => {
        if (hasInitialized.current) return;

        const workspacePath = searchParams?.get("workspacePath");
        dispatch(closeCanvas());

        if (workspacePath) {
            dispatch(
                openCanvas({
                    type: "article",
                    workspacePath,
                    workspaceContentVersion: Date.now(),
                    filename: workspacePath.split("/").pop() || null,
                    title: "Canvas",
                }),
            );
        } else {
            dispatch(openCanvas({ type: "empty", title: "Canvas" }));
        }

        dispatch(setCanvasVisibility(true));
        hasInitialized.current = true;
    }, [dispatch, searchParams]);

    useEffect(() => {
        const workspacePath = searchParams?.get("workspacePath");
        if (
            workspacePath &&
            hasInitialized.current &&
            canvasContent?.workspacePath !== workspacePath
        ) {
            dispatch(
                openCanvas({
                    type: "article",
                    workspacePath,
                    workspaceContentVersion: Date.now(),
                    filename: workspacePath.split("/").pop() || null,
                    title: "Canvas",
                }),
            );
        }
    }, [dispatch, searchParams, canvasContent]);

    return <Chat />;
}
