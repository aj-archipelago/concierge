import { gql } from "@apollo/client";

export const RUN_WORKSPACE_PROMPT_PATHWAY = "run_workspace_prompt";

export function isUnsupportedReasoningEffortError(error) {
    return /reasoningEffort|Unknown argument|Unknown variable|is not defined/i.test(
        error?.message || "",
    );
}

export function getRunWorkspacePromptQuery(
    pathwayName = RUN_WORKSPACE_PROMPT_PATHWAY,
    { includeReasoningEffort = false, includeStream = false } = {},
) {
    return gql`
        query ${pathwayName}(
            $chatHistory: [MultiMessage]
            $async: Boolean
            $model: String
            $fileAccessPlan: [FileAccessTargetInput]
            ${includeReasoningEffort ? "$reasoningEffort: String" : ""}
            ${includeStream ? "$stream: Boolean" : ""}
        ) {
            ${pathwayName}(
                chatHistory: $chatHistory
                async: $async
                model: $model
                fileAccessPlan: $fileAccessPlan
                ${includeReasoningEffort ? "reasoningEffort: $reasoningEffort" : ""}
                ${includeStream ? "stream: $stream" : ""}
            ) {
                result
                tool
            }
        }
    `;
}
