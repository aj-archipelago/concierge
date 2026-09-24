"use client";

import { useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AuthContext } from "../../App";
import { LanguageContext } from "../../contexts/LanguageProvider";
import { useUpdateAiOptions } from "../../../app/queries/options";
import { normalizeReasoningEffortForModel } from "../../utils/reasoningEffortI18n";
import { ModelThinkingPanel } from "../ModelThinkingControl";
import { useResolvedAgentModel } from "../../hooks/useResolvedAgentModel";

export default function AIAssistantSection() {
    const { t } = useTranslation();
    const { user } = useContext(AuthContext);
    const { direction } = useContext(LanguageContext);
    const isRTL = direction === "rtl";

    const { agentModels, resolvedAgentModel, persistResolvedAgentModel } =
        useResolvedAgentModel(user);
    const updateAiOptionsMutation = useUpdateAiOptions();

    const [aiName, setAiName] = useState(user?.aiName || "Concierge");
    const [agentModel, setAgentModel] = useState(resolvedAgentModel);
    const [useCustomEntities, setUseCustomEntities] = useState(
        user?.useCustomEntities || false,
    );
    const [reasoningEffort, setReasoningEffort] = useState(
        user?.reasoningEffort || "low",
    );
    const [error, setError] = useState("");
    const selectedAgentModel = agentModels?.find(
        (model) => model.modelId === agentModel,
    );
    const displayedReasoningEffort = normalizeReasoningEffortForModel(
        selectedAgentModel,
        reasoningEffort,
    );

    useEffect(() => {
        if (reasoningEffort !== displayedReasoningEffort) {
            setReasoningEffort(displayedReasoningEffort);
        }
    }, [reasoningEffort, displayedReasoningEffort]);

    useEffect(() => {
        if (user) {
            setAiName(user.aiName || "Concierge");
            setAgentModel(resolvedAgentModel);
            setUseCustomEntities(user.useCustomEntities || false);
            setReasoningEffort(
                normalizeReasoningEffortForModel(
                    agentModels?.find(
                        (model) => model.modelId === resolvedAgentModel,
                    ),
                    user.reasoningEffort,
                ),
            );
            persistResolvedAgentModel(resolvedAgentModel);
        }
    }, [user, resolvedAgentModel, persistResolvedAgentModel, agentModels]);

    const saveOptions = async (updates) => {
        if (!user?.userId) return;
        const nextAgentModel = updates.agentModel ?? agentModel;
        const nextSelectedAgentModel =
            agentModels?.find((model) => model.modelId === nextAgentModel) ??
            selectedAgentModel;
        const nextReasoningEffort = normalizeReasoningEffortForModel(
            nextSelectedAgentModel,
            updates.reasoningEffort ?? reasoningEffort,
        );

        try {
            await updateAiOptionsMutation.mutateAsync({
                userId: user.userId,
                contextId: user.contextId,
                aiMemorySelfModify: user.aiMemorySelfModify,
                aiName: updates.aiName ?? aiName,
                agentModel: nextAgentModel,
                useCustomEntities:
                    updates.useCustomEntities ?? useCustomEntities,
                reasoningEffort: nextReasoningEffort,
            });
            setError("");
            return true;
        } catch (err) {
            setError(
                err.response?.data?.error ||
                    err.message ||
                    t("Failed to save options"),
            );
            setAgentModel(resolvedAgentModel);
            setReasoningEffort(
                normalizeReasoningEffortForModel(
                    selectedAgentModel,
                    user?.reasoningEffort,
                ),
            );
            return false;
        }
    };

    return (
        <div className="space-y-5">
            {error && (
                <div
                    className={`text-red-500 text-sm p-2 bg-red-50 dark:bg-red-900/20 rounded ${isRTL ? "text-right" : ""}`}
                    dir={direction}
                >
                    {error}
                </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                    <label
                        className={`block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1 ${isRTL ? "text-right" : ""}`}
                        htmlFor="portal-aiName"
                    >
                        {t("AI Name")}
                    </label>
                    <input
                        id="portal-aiName"
                        type="text"
                        value={aiName}
                        onChange={(e) => {
                            setAiName(e.target.value);
                            saveOptions({ aiName: e.target.value });
                        }}
                        className="lb-input w-full text-sm"
                        placeholder={t("Enter AI Name")}
                        dir={direction}
                    />
                </div>
            </div>

            <hr className="border-gray-200 dark:border-gray-700" />

            <ModelThinkingPanel
                models={agentModels}
                modelId={agentModel}
                reasoningEffort={displayedReasoningEffort}
                disabled={updateAiOptionsMutation.isPending}
                onChange={(changes) => {
                    if (changes.model) setAgentModel(changes.model);
                    setReasoningEffort(changes.reasoningEffort);
                    return saveOptions({
                        ...(changes.model ? { agentModel: changes.model } : {}),
                        reasoningEffort: changes.reasoningEffort,
                    });
                }}
            />

            <hr className="border-gray-200 dark:border-gray-700" />

            <div
                className={`flex gap-2 items-center ${isRTL ? "flex-row-reverse justify-end" : ""}`}
            >
                <input
                    type="checkbox"
                    id="portal-useCustomEntities"
                    className={`accent-sky-500 ${isRTL ? "order-2" : ""}`}
                    checked={useCustomEntities}
                    onChange={(e) => {
                        setUseCustomEntities(e.target.checked);
                        saveOptions({ useCustomEntities: e.target.checked });
                    }}
                />
                <label
                    htmlFor="portal-useCustomEntities"
                    className={`text-sm text-gray-900 dark:text-gray-100 cursor-pointer ${isRTL ? "order-1" : ""}`}
                    dir={direction}
                >
                    {t("Use other custom entities")}
                </label>
            </div>
        </div>
    );
}
