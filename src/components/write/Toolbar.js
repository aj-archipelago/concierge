import { useRef, useContext, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { LanguageContext } from "../../contexts/LanguageProvider";
import {
    Tooltip,
    TooltipTrigger,
    TooltipContent,
    TooltipProvider,
} from "@/components/ui/tooltip";

function Toolbar({
    actions,
    isTextPresent,
    isTextSelected,
    onAction,
    inputText,
}) {
    const ref = useRef(null);
    const targetRef = useRef(null);
    const { t } = useTranslation();
    const { language } = useContext(LanguageContext);
    const [openTooltip, setOpenTooltip] = useState(null);
    const tooltipTimerRef = useRef(null);

    const handleAction = useCallback(
        (key) => {
            setOpenTooltip(null);
            if (tooltipTimerRef.current) {
                clearTimeout(tooltipTimerRef.current);
            }
            onAction(key);
        },
        [onAction],
    );

    const handleMouseEnter = useCallback((key) => {
        if (tooltipTimerRef.current) {
            clearTimeout(tooltipTimerRef.current);
        }
        tooltipTimerRef.current = setTimeout(() => {
            setOpenTooltip(key);
        }, 200); // 200ms delay before showing tooltip
    }, []);

    const handleMouseLeave = useCallback(() => {
        if (tooltipTimerRef.current) {
            clearTimeout(tooltipTimerRef.current);
        }
        setOpenTooltip(null);
    }, []);

    return (
        <div className="relative px-2.5" ref={ref}>
            <div className="flex gap-6">
                {Object.keys(actions)
                    .filter(
                        (k) =>
                            ![
                                "remove_content",
                                "summarize",
                                "entities",
                                "tags",
                                "topics",
                                "keywords",
                                "headline",
                            ].includes(k),
                    )
                    .sort((a, b) =>
                        actions[a].title.localeCompare(actions[b].title),
                    )
                    .map((key) => {
                        const action = actions[key];
                        const { Icon, type } = action;

                        let buttonEnabled =
                            type === "always-available" ||
                            (isTextPresent &&
                                (type !== "selection" || isTextSelected));

                        return (
                            <div key={`toolbar-button-${key}`}>
                                <TooltipProvider>
                                    <Tooltip open={openTooltip === key}>
                                        <TooltipTrigger asChild>
                                            <button
                                                ref={targetRef}
                                                className={`mb-2.5 text-sm text-start text-sky-600 rounded-md ${!buttonEnabled ? "opacity-50 cursor-not-allowed" : ""}`}
                                                disabled={!buttonEnabled}
                                                onClick={() =>
                                                    handleAction(key)
                                                }
                                                onMouseEnter={() =>
                                                    handleMouseEnter(key)
                                                }
                                                onMouseLeave={handleMouseLeave}
                                            >
                                                <Icon />
                                            </button>
                                        </TooltipTrigger>
                                        <TooltipContent
                                            side={
                                                language.includes("ar")
                                                    ? "left"
                                                    : "right"
                                            }
                                        >
                                            {t(actions[key].title)}
                                        </TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                            </div>
                        );
                    })}
            </div>
        </div>
    );
}

export default Toolbar;
