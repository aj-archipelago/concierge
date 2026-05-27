import {
    getRunWorkspacePromptQuery,
    isUnsupportedReasoningEffortError,
    RUN_WORKSPACE_PROMPT_PATHWAY,
} from "../../../src/utils/runWorkspacePromptQuery.js";

export { RUN_WORKSPACE_PROMPT_PATHWAY };

export async function executeRunWorkspacePrompt({
    graphqlClient,
    variables,
    models,
    pathwayName = RUN_WORKSPACE_PROMPT_PATHWAY,
    includeStream = false,
    fetchPolicy = "network-only",
    onUnsupportedReasoningEffort,
}) {
    const modelAttempts =
        Array.isArray(models) && models.length > 0
            ? models
            : [variables?.model].filter(Boolean);
    const attempts = modelAttempts.length > 0 ? modelAttempts : [undefined];
    let lastError = null;

    for (const model of attempts) {
        const requestVariables = {
            ...variables,
            ...(model ? { model } : {}),
        };

        try {
            const response = await graphqlClient.query({
                query: getRunWorkspacePromptQuery(pathwayName, {
                    includeReasoningEffort: Boolean(
                        requestVariables.reasoningEffort,
                    ),
                    includeStream,
                }),
                variables: requestVariables,
                fetchPolicy,
            });

            return { response, model };
        } catch (error) {
            lastError = error;

            if (
                requestVariables.reasoningEffort &&
                isUnsupportedReasoningEffortError(error)
            ) {
                const { reasoningEffort, ...variablesWithoutReasoning } =
                    requestVariables;

                try {
                    const response = await graphqlClient.query({
                        query: getRunWorkspacePromptQuery(pathwayName, {
                            includeReasoningEffort: false,
                            includeStream,
                        }),
                        variables: variablesWithoutReasoning,
                        fetchPolicy,
                    });

                    onUnsupportedReasoningEffort?.(error);

                    return { response, model };
                } catch (retryError) {
                    lastError = retryError;
                }
            }
        }
    }

    throw lastError || new Error(`Failed to run ${pathwayName}`);
}
