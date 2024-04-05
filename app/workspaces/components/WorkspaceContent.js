"use client";
import { createContext, useState } from "react";
import { useTranslation } from "react-i18next";
import LoadingButton from "../../../src/components/editor/LoadingButton";
import { useCreateRun, useDeleteRun } from "../../queries/runs";
import {
    useDeleteWorkspaceRuns,
    useWorkspace,
    useWorkspaceRuns,
} from "../../queries/workspaces";
import WorkspaceInput from "./WorkspaceInput";
import WorkspaceOutputs from "./WorkspaceOutputs";

export default function WorkspaceContent({ id, user }) {
    const { data: workspace } = useWorkspace(id);
    const { data: outputs } = useWorkspaceRuns(id);
    const [error, setError] = useState(null);
    const createRun = useCreateRun();
    const deleteRun = useDeleteRun();
    const deleteWorkspaceRuns = useDeleteWorkspaceRuns();
    const { t } = useTranslation();

    return (
        <WorkspaceContext.Provider
            value={{
                workspace,
                user,
                isOwner: user._id?.toString() === workspace?.owner?.toString(),
            }}
        >
            <>
                {error && (
                    <div className="bg-red-100 text-sm text-red-800 p-4 rounded-md m-1 mb-3">
                        {error.response?.data?.message ||
                            error.message ||
                            JSON.stringify(error)}
                    </div>
                )}
                <div className="flex gap-6 grow overflow-auto">
                    <div className="basis-6/12 overflow-auto">
                        <WorkspaceInput
                            onRunMany={(text, prompts) => async () => {
                                await Promise.all(
                                    prompts.map(async (prompt) => {
                                        try {
                                            await createRun.mutateAsync({
                                                text,
                                                prompt: prompt?.text,
                                                systemPrompt:
                                                    workspace?.systemPrompt,
                                                workspaceId: id,
                                            });
                                        } catch (error) {
                                            console.error(error);
                                            setError(error);
                                        }
                                    }),
                                );
                            }}
                            onRun={async (title, text, prompt) => {
                                try {
                                    await createRun.mutateAsync({
                                        text,
                                        prompt,
                                        systemPrompt: workspace?.systemPrompt,
                                        workspaceId: id,
                                    });
                                } catch (error) {
                                    console.error(error);
                                    setError(error);
                                }
                            }}
                        />
                    </div>
                    <div className="basis-6/12">
                        {outputs?.length > 0 && (
                            <>
                                <div className="flex justify-between">
                                    <h4 className="text-lg font-medium mb-4">
                                        {t("Outputs")}
                                    </h4>
                                    <div>
                                        <LoadingButton
                                            text="Deleting"
                                            onClick={async () => {
                                                if (
                                                    window.confirm(
                                                        t(
                                                            "Are you sure you want to delete all outputs?",
                                                        ),
                                                    )
                                                ) {
                                                    await deleteWorkspaceRuns.mutateAsync(
                                                        {
                                                            id,
                                                        },
                                                    );
                                                }
                                            }}
                                            className="lb-sm lb-outline-secondary"
                                        >
                                            {t("Delete all")}
                                        </LoadingButton>
                                    </div>
                                </div>

                                <div className="text-gray-400 text-sm">
                                    Outputs will be automatically deleted after
                                    15 days
                                </div>
                                <WorkspaceOutputs
                                    outputs={outputs}
                                    onDelete={async (id) => {
                                        await deleteRun.mutateAsync({ id });
                                    }}
                                />
                            </>
                        )}
                    </div>
                </div>
            </>
        </WorkspaceContext.Provider>
    );
}

export const WorkspaceContext = createContext();
