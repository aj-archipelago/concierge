"use client";
import { Brain } from "lucide-react";
import { SettingsCard, SettingsToggle } from "../portal/SettingsPrimitives";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
    useAgentModels,
    resolveAgentModelForSend,
} from "../../../app/queries/modelMetadata";
import { useSaveColleague } from "../../hooks/useColleagues";
import { normalizeReasoningEffortForModel } from "../../utils/reasoningEffortI18n";
import { ModelThinkingPanel } from "../ModelThinkingControl";

export default function EntityOptions({ entity }) {
    const { t } = useTranslation();
    const { data: models = [], redirects } = useAgentModels();
    const save = useSaveColleague();
    const [error, setError] = useState("");
    const modelId = resolveAgentModelForSend(
        entity.model,
        models,
        redirects,
        "cortex-agent-chat",
    );
    const model = models.find((m) => m.modelId === modelId);
    const effort = normalizeReasoningEffortForModel(
        model,
        entity.reasoningEffort,
    );
    async function update(changes) {
        setError("");
        try {
            await save.mutateAsync({ id: entity.id, ...changes });
            return true;
        } catch (err) {
            setError(err.response?.data?.error || t("colleagues.error"));
            return false;
        }
    }
    return (
        <div className="space-y-4 text-gray-900 dark:text-gray-100">
            {entity.kind === "colleague" && entity.editable && (
                <button
                    type="button"
                    disabled={save.isPending}
                    onClick={() => update({ defaultModel: modelId })}
                    className="min-h-10 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                >
                    {t("assistantDirectory.defaultModel")}
                </button>
            )}
            <ModelThinkingPanel
                models={models}
                modelId={modelId}
                reasoningEffort={effort}
                disabled={save.isPending}
                onChange={update}
            />
            {entity.useMemory !== false && (
                <SettingsCard icon={Brain} title={t("Memory")}>
                    <SettingsToggle
                        label={t("colleagues.learnMemory")}
                        description={t("portal_memory_learning_description")}
                        checked={entity.memoryLearning ?? true}
                        disabled={save.isPending}
                        onChange={(event) =>
                            update({ memoryLearning: event.target.checked })
                        }
                    />
                </SettingsCard>
            )}
            <p className="text-xs leading-5 text-gray-500 dark:text-gray-400">
                {t("colleagues.optionsNote")}
            </p>
            {error && (
                <p
                    role="alert"
                    className="text-sm text-red-700 dark:text-red-300"
                >
                    {error}
                </p>
            )}
        </div>
    );
}
