import { useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import Link from "next/link";
import { LanguageContext } from "../contexts/LanguageProvider";
import { usePortal } from "../contexts/PortalContext";
import { AuthContext } from "../App";
import { useCurrentEntityId } from "../contexts/CurrentEntityContext";
import { useColleagues, useSaveColleague } from "../hooks/useColleagues";
import ModelThinkingControl from "../components/ModelThinkingControl";
import { Settings } from "lucide-react";
import {
    useAgentModels,
    getProviderFromModelId,
} from "../../app/queries/modelMetadata";
import {
    OpenAIIcon,
    GoogleGeminiIcon,
    AnthropicIcon,
    XAIGrokIcon,
    MoonshotIcon,
} from "../components/icons/ModelIcons";

export default function Footer() {
    const { t } = useTranslation();
    const { direction } = useContext(LanguageContext);
    const { openPortal } = usePortal();
    const { user } = useContext(AuthContext);
    const currentEntityId = useCurrentEntityId();
    const { data: colleagues = [] } = useColleagues({
        enabled: Boolean(user?.contextId),
        ids: [currentEntityId || user?.personalEntityId].filter(Boolean),
    });
    const entity = colleagues.find(
        (e) => e.id === (currentEntityId || user?.personalEntityId),
    );
    const save = useSaveColleague();
    const [modelError, setModelError] = useState("");
    useEffect(
        () => setModelError(""),
        [currentEntityId, user?.personalEntityId],
    );
    const currentYear = new Date().getFullYear();
    const copyrightText = t("footer_copyright", { year: currentYear });

    // Get the provider icon for the current agent model
    const { data: agentModels } = useAgentModels();
    const defaultModelId = agentModels?.find((m) => m.isDefault)?.modelId;
    const agentModel = entity?.model || user?.agentModel || defaultModelId;
    const provider = getProviderFromModelId(agentModel, agentModels);

    const getProviderIcon = () => {
        switch (provider) {
            case "openai":
                return <OpenAIIcon className="w-4 h-4" />;
            case "google":
                return <GoogleGeminiIcon className="w-4 h-4" />;
            case "anthropic":
                return <AnthropicIcon className="w-4 h-4" />;
            case "xai":
                return <XAIGrokIcon className="w-4 h-4" />;
            case "moonshot":
                return <MoonshotIcon className="w-4 h-4" />;
            default:
                return <OpenAIIcon className="w-4 h-4" />;
        }
    };

    return (
        <div
            dir={direction}
            className="flex min-h-14 flex-wrap items-center justify-end gap-x-3 gap-y-1 border-t border-gray-300/70 bg-zinc-200 px-3 py-1.5 text-xs text-sky-700 dark:border-gray-700 dark:bg-gray-800 dark:text-sky-400 sm:flex-nowrap sm:justify-between sm:px-4"
        >
            <div className="hidden min-w-0 items-center gap-4 sm:flex">
                <div className="truncate text-xs">{copyrightText}</div>
                <Link
                    href="/privacy"
                    className="text-sky-700 dark:text-sky-400 hover:text-sky-700 dark:hover:text-sky-300 text-xs hidden md:block"
                >
                    {t("footer_privacy_policy")}
                </Link>
            </div>

            <div className="flex max-w-full shrink-0 items-center gap-2">
                <button
                    type="button"
                    aria-label={t("Settings")}
                    title={t("Settings")}
                    aria-haspopup="dialog"
                    onClick={() => openPortal("profile")}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-gray-300/80 bg-white/80 text-gray-500 shadow-sm transition-colors hover:border-sky-400 hover:bg-sky-50 hover:text-sky-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-200 dark:border-gray-600 dark:bg-gray-900/40 dark:text-gray-400 dark:hover:border-sky-500/60 dark:hover:bg-gray-700 dark:hover:text-sky-300 dark:focus-visible:ring-sky-400 dark:focus-visible:ring-offset-gray-800"
                >
                    <Settings aria-hidden="true" className="h-4 w-4" />
                </button>

                <ModelThinkingControl
                    key={entity?.id}
                    models={agentModels}
                    modelId={agentModel}
                    reasoningEffort={
                        entity?.reasoningEffort ||
                        (entity?.id === user?.personalEntityId
                            ? user?.reasoningEffort
                            : undefined)
                    }
                    disabled={!entity || save.isPending}
                    icon={getProviderIcon()}
                    title={entity?.name}
                    label={t("thinkingControl.choose", {
                        name: entity?.name || user?.aiName || "Concierge",
                    })}
                    error={modelError}
                    onChange={async (changes) => {
                        setModelError("");
                        try {
                            await save.mutateAsync({
                                id: entity.id,
                                ...changes,
                            });
                            return true;
                        } catch (error) {
                            setModelError(
                                error.response?.data?.error ||
                                    t("colleagues.error"),
                            );
                            return false;
                        }
                    }}
                />
            </div>
        </div>
    );
}
