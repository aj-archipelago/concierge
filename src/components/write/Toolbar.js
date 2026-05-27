import { useRef, useContext, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { LanguageContext } from "../../contexts/LanguageProvider";
import {
    Tooltip,
    TooltipTrigger,
    TooltipContent,
    TooltipProvider,
} from "@/components/ui/tooltip";
import {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Menu } from "lucide-react";

function Toolbar({
    actions,
    isTextPresent,
    isTextSelected,
    onAction,
    inputText,
    sidebarItems = [],
    onSidebarItemClick,
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
            <div className="flex gap-6 items-center">
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
                {sidebarItems.length > 0 && (
                    <DropdownMenu>
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <DropdownMenuTrigger asChild>
                                        <button
                                            className="mb-2.5 text-sm text-start text-sky-600 rounded-md"
                                            disabled={!isTextPresent}
                                        >
                                            <Menu className="w-5 h-5" />
                                        </button>
                                    </DropdownMenuTrigger>
                                </TooltipTrigger>
                                <TooltipContent
                                    side={
                                        language.includes("ar")
                                            ? "left"
                                            : "right"
                                    }
                                >
                                    {t("AI Tools")}
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                        <DropdownMenuContent
                            align={language.includes("ar") ? "end" : "start"}
                            className="w-56"
                        >
                            {sidebarItems.map((item) => (
                                <DropdownMenuItem
                                    key={item.key}
                                    onClick={() => onSidebarItemClick(item.key)}
                                    disabled={!isTextPresent}
                                    className="flex items-center gap-2"
                                >
                                    {item.icon}
                                    <span>{t(item.name)}</span>
                                </DropdownMenuItem>
                            ))}
                        </DropdownMenuContent>
                    </DropdownMenu>
                )}
            </div>
        </div>
    );
}

export default Toolbar;
