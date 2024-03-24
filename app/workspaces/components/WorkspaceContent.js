"use client";
import axios from "axios";
import { createContext, useRef, useState } from "react";
import stringcase from "stringcase";
import { useWorkspace } from "../../queries/workspaces";
import WorkspaceInput from "./WorkspaceInput";
import WorkspaceOutputs from "./WorkspaceOutputs";

export default function WorkspaceContent({ id, user }) {
    const [outputs, setOutputs] = useState([]);
    const outputsRef = useRef(outputs);
    outputsRef.current = outputs;
    const { data: workspace } = useWorkspace(id);
    const [error, setError] = useState(null);

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
                                const outputs = await Promise.all(
                                    prompts.map(async (prompt) => {
                                        try {
                                            const res = await axios.post(
                                                "/api/runs",
                                                {
                                                    text,
                                                    prompt: prompt.text,
                                                    systemPrompt:
                                                        workspace?.systemPrompt,
                                                },
                                            );
                                            return {
                                                _id: Math.random(),
                                                title: stringcase.titlecase(
                                                    prompt.title,
                                                ),
                                                text: res.data.data
                                                    .run_gpt35turbo.result,
                                                createdAt: new Date(),
                                            };
                                        } catch (error) {
                                            console.error(error);
                                            setError(error);
                                        }
                                    }),
                                );

                                setOutputs([
                                    ...outputs,
                                    ...(outputsRef.current || []),
                                ]);
                            }}
                            onRun={async (title, text, prompt) => {
                                try {
                                    await axios
                                        .post("/api/runs", {
                                            text,
                                            prompt,
                                            systemPrompt:
                                                workspace?.systemPrompt,
                                        })
                                        .then((res) => {
                                            const outputText =
                                                res.data.data.run_gpt35turbo
                                                    .result;

                                            setOutputs([
                                                {
                                                    _id: Math.random(),
                                                    title: stringcase.titlecase(
                                                        title,
                                                    ),
                                                    text: outputText,
                                                    createdAt: new Date(),
                                                },
                                                ...(outputsRef.current || []),
                                            ]);
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
                                <h4 className="text-lg font-medium mb-4">
                                    Outputs
                                </h4>
                                <WorkspaceOutputs
                                    outputs={outputs}
                                    onDelete={(_id) => {
                                        setOutputs(
                                            outputs.filter(
                                                (output) => output._id !== _id,
                                            ),
                                        );
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
