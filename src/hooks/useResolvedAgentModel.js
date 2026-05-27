import { useCallback, useMemo, useRef } from "react";
import {
    resolveAgentModelForSend,
    useAgentModels,
} from "../../app/queries/modelMetadata";
import { useUpdateAiOptions } from "../../app/queries/options";
import config from "../../config";

export function useResolvedAgentModel(user) {
    const { data: agentModels, redirects } = useAgentModels();
    const updateAiOptionsMutation = useUpdateAiOptions();
    const pendingAgentModelWriteRef = useRef(null);

    const defaultAgentModel =
        agentModels?.find((model) => model.isDefault)?.modelId ||
        config.cortex.defaultChatModel;

    const resolvedAgentModel = useMemo(
        () =>
            resolveAgentModelForSend(
                user?.agentModel,
                agentModels,
                redirects,
                defaultAgentModel,
            ),
        [user?.agentModel, agentModels, redirects, defaultAgentModel],
    );

    const persistResolvedAgentModel = useCallback(
        (modelId = resolvedAgentModel) => {
            if (
                !user?.userId ||
                !user?.agentModel ||
                !modelId ||
                modelId === user.agentModel ||
                !agentModels?.length
            ) {
                return;
            }

            const writeKey = `${user.agentModel}->${modelId}`;
            if (pendingAgentModelWriteRef.current === writeKey) {
                return;
            }

            pendingAgentModelWriteRef.current = writeKey;
            updateAiOptionsMutation.mutate(
                {
                    userId: user.userId,
                    contextId: user.contextId,
                    aiMemorySelfModify: user.aiMemorySelfModify ?? false,
                    aiName: user.aiName ?? "Concierge",
                    agentModel: modelId,
                    useCustomEntities: user.useCustomEntities ?? false,
                    reasoningEffort: user.reasoningEffort ?? "low",
                },
                {
                    onError: (error) => {
                        pendingAgentModelWriteRef.current = null;
                        console.warn(
                            "Failed to persist resolved agent model",
                            error,
                        );
                    },
                },
            );
        },
        [agentModels, resolvedAgentModel, updateAiOptionsMutation, user],
    );

    return {
        agentModels,
        redirects,
        defaultAgentModel,
        resolvedAgentModel,
        persistResolvedAgentModel,
    };
}
