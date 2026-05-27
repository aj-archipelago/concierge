"use client";

import React from "react";
import { useDispatch } from "react-redux";
import { useTranslation } from "react-i18next";
import { setCanvasVisibility, openCanvas } from "../../stores/chatSlice";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

/**
 * Mobile Tab Bar - Tab trigger bar for switching between Chat and Canvas
 * Only visible on mobile devices (< 768px)
 */
export default function MobileTabBar({ canvasVisible, canvasContent }) {
    const { t } = useTranslation();
    const dispatch = useDispatch();

    const activeTab = canvasVisible ? "canvas" : "chat";

    const handleValueChange = (value) => {
        if (value === "canvas") {
            if (!canvasContent) {
                dispatch(
                    openCanvas({
                        type: "empty",
                        title: t("Canvas"),
                    }),
                );
            }
            dispatch(setCanvasVisibility(true));
        } else {
            dispatch(setCanvasVisibility(false));
        }
    };

    return (
        <Tabs
            value={activeTab}
            onValueChange={handleValueChange}
            className="md:hidden"
        >
            <TabsList className="w-full block">
                <TabsTrigger value="chat" className="w-1/2">
                    {t("Chat")}
                </TabsTrigger>
                <TabsTrigger value="canvas" className="w-1/2">
                    {t("Canvas")}
                </TabsTrigger>
            </TabsList>
        </Tabs>
    );
}
