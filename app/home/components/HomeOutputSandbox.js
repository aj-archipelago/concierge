"use client";

import PageHeader from "../../../src/layout/PageHeader";
import { useContext, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { LayoutGrid, Loader2 } from "lucide-react";
import { toast } from "react-toastify";
import OutputSandbox from "@/src/components/sandbox/OutputSandbox";
import { ThemeContext } from "@/src/contexts/ThemeProvider";
import { HeaderAction } from "@/src/layout/HeaderControls";

function HomeViewAction() {
    const { t } = useTranslation();
    const router = useRouter();
    const [isSwitching, setIsSwitching] = useState(false);
    const handleSwitch = async () => {
        setIsSwitching(true);
        try {
            const response = await fetch("/api/users/me/home-applet", {
                method: "DELETE",
            });
            if (!response.ok) throw new Error();
            router.refresh();
        } catch {
            toast.error(t("Couldn't switch Home. Please try again."));
            setIsSwitching(false);
        }
    };
    return (
        <HeaderAction
            icon={isSwitching ? Loader2 : LayoutGrid}
            label={t("Use standard Home")}
            disabled={isSwitching}
            onClick={handleSwitch}
        />
    );
}

export default function HomeOutputSandbox({ html }) {
    const { theme } = useContext(ThemeContext);
    const { t } = useTranslation();
    return (
        <div className="relative h-full min-h-0 w-full">
            <OutputSandbox
                content={html}
                height="100%"
                theme={theme}
                autoResize={false}
            />
            <PageHeader title={t("Home")}>
                <HomeViewAction />
            </PageHeader>
        </div>
    );
}
