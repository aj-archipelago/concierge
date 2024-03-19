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

    return (
        <WorkspaceContext.Provider
            value={{
                workspace,
                user,
                isOwner: user._id?.toString() === workspace?.owner?.toString(),
            }}
        >
            <div className="flex gap-6 grow overflow-auto">
                <div className="basis-6/12">
                    <WorkspaceInput
                        onRun={async (title, text, prompt) => {
                            await axios
                                .post("/api/runs", {
                                    text,
                                    prompt,
                                    systemPrompt: workspace?.systemPrompt,
                                })
                                .then((res) => {
                                    const outputText =
                                        res.data.data.run_gpt35turbo.result;

                                    setOutputs([
                                        {
                                            _id: Math.random(),
                                            title: stringcase.titlecase(title),
                                            text: outputText,
                                            createdAt: new Date(),
                                        },
                                        ...(outputsRef.current || []),
                                    ]);
                                });
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
        </WorkspaceContext.Provider>
    );
}

export const WorkspaceContext = createContext();
