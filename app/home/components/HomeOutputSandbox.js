"use client";

import { useContext } from "react";
import OutputSandbox from "@/src/components/sandbox/OutputSandbox";
import { ThemeContext } from "@/src/contexts/ThemeProvider";

export default function HomeOutputSandbox({ html }) {
    const { theme } = useContext(ThemeContext);

    return (
        <div className="h-full min-h-0 w-full">
            <OutputSandbox
                content={html}
                height="100%"
                theme={theme}
                autoResize={false}
            />
        </div>
    );
}
