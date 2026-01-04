import { useTranslation } from "react-i18next";
import LLMSelector from "./LLMSelector";

/**
 * Combined component for LLM selection and agent mode configuration
 * Groups related model/execution settings together
 */
export default function ModelConfiguration({
    llm,
    setLLM,
    agentMode,
    setAgentMode,
    researchMode,
    setResearchMode,
    disabled = false,
    defaultModelIdentifier,
    showPublishedWarning = false,
}) {
    const { t } = useTranslation();

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
                                setResearchMode(false);
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
                <div className="flex items-center gap-2">
                    <input
                        type="checkbox"
                        id="researchMode"
                        checked={researchMode}
                        onChange={(e) => setResearchMode(e.target.checked)}
                        disabled={disabled || !agentMode}
                        className="accent-sky-500"
                    />
                    <label
                        htmlFor="researchMode"
                        className={`text-sm cursor-pointer ${
                            !agentMode
                                ? "text-gray-400 dark:text-gray-600"
                                : "text-gray-700 dark:text-gray-300"
                        }`}
                    >
                        {t("Research Mode")}
                    </label>
                </div>
            </div>
        </div>
    );
}
