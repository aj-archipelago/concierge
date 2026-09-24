"use client";

import usePageDialogNavigation from "@/src/hooks/usePageDialogNavigation";

export default function useHomeViewNavigation() {
    return usePageDialogNavigation({
        viewParam: "homeView",
        itemParam: "item",
    });
}
