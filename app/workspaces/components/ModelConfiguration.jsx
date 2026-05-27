import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import LLMSelector from "./LLMSelector";
import { useChatModels } from "../../queries/modelMetadata";
import {
    getReasoningEffortLevelsForModel,
    normalizeReasoningEffortForModel,
    reasoningEffortLevelLabelKey,
} from "@/src/utils/reasoningEffortI18n";

/**
 * Combined component for LLM selection and agent mode configuration
 * Groups related model/execution settings together
 */
export default function ModelConfiguration({
    llm,
    setLLM,
    agentMode,
    setAgentMode,
    reasoningEffort,
    setReasoningEffort,
    disabled = false,
    defaultModelIdentifier,
    showPublishedWarning = false,
}) {
    const { t } = useTranslation();
    const { data: chatModels } = useChatModels();
    const selectedModel = chatModels?.find((model) => model.modelId === llm);
    const reasoningEffortLevels =
        getReasoningEffortLevelsForModel(selectedModel);
    const hasModelReasoningRestriction =
        Array.isArray(selectedModel?.supportedReasoningEfforts) &&
        selectedModel.supportedReasoningEfforts.length > 0;
    const displayedReasoningEffort = hasModelReasoningRestriction
        ? normalizeReasoningEffortForModel(selectedModel, reasoningEffort)
        : reasoningEffort;

    useEffect(() => {
        if (
            agentMode &&
            hasModelReasoningRestriction &&
            reasoningEffort !== displayedReasoningEffort
        ) {
            setReasoningEffort(displayedReasoningEffort);
        }
    }, [
        agentMode,
        hasModelReasoningRestriction,
        reasoningEffort,
        displayedReasoningEffort,
        setReasoningEffort,
    ]);

    return (
        <div className="mb-4">
            <label className="text-sm text-gray-500 mb-1 block">
                {t("Model")}
            </label>
            <div>
                <LLMSelector
                    value={llm}
                    onChange={setLLM}
                    defaultModelIdentifier={defaultModelIdentifier}
                    disabled={disabled}
                />

                {showPublishedWarning && (
                    <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                        {t(
                            "The model cannot be modified because this workspace is published to Cortex.",
                        )}
                    </div>
                )}
            </div>

            <div className="mt-4 flex items-center gap-4 justify-end">
                <div className="flex items-center gap-2">
                    <input
                        type="checkbox"
                        id="agentMode"
                        checked={agentMode}
                        onChange={(e) => {
                            const checked = e.target.checked;
                            setAgentMode(checked);
                            if (!checked) {
                                setReasoningEffort(null);
                            }
                        }}
                        disabled={disabled}
                        className="accent-sky-500"
                    />
                    <label
                        htmlFor="agentMode"
                        className="text-sm text-gray-700 dark:text-gray-300 cursor-pointer"
                    >
                        {t("Agent Mode")}
                    </label>
                </div>
                {agentMode && (
                    <div className="flex items-center gap-2">
                        <label className="text-sm text-gray-700 dark:text-gray-300">
                            {t("Reasoning")}
                        </label>
                        <div className="flex rounded-md overflow-hidden border border-gray-200 dark:border-gray-600">
                            {reasoningEffortLevels.map((level) => (
                                <button
                                    key={level}
                                    type="button"
                                    onClick={() => setReasoningEffort(level)}
                                    disabled={disabled}
                                    className={`px-2 py-1 text-xs font-medium transition-colors capitalize ${
                                        displayedReasoningEffort === level
                                            ? "bg-sky-500 text-white"
                                            : "bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600"
                                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                                >
                                    {t(reasoningEffortLevelLabelKey(level))}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
