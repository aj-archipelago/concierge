"use client";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { createContext, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import LoadingButton from "../../../src/components/editor/LoadingButton";
import { useCreateRun, useDeleteRun } from "../../queries/runs";
import {
    useDeleteWorkspaceRuns,
    useWorkspace,
    useWorkspaceRuns,
} from "../../queries/workspaces";
import classNames from "../../utils/class-names";
import WorkspaceInput from "./WorkspaceInput";
import WorkspaceOutputs from "./WorkspaceOutputs";

export default function WorkspaceContent({ idOrSlug, user }) {
    const { data: workspace } = useWorkspace(idOrSlug);
    const { data: outputs } = useWorkspaceRuns(workspace?._id);
    const [error, setError] = useState(null);
    const [deleteAllDialogOpen, setDeleteAllDialogOpen] = useState(false);
    const createRun = useCreateRun();
    const deleteRun = useDeleteRun();
    const deleteWorkspaceRuns = useDeleteWorkspaceRuns();
    const { t } = useTranslation();
    const [activeTab, setActiveTab] = useState("input");
    const ref = useRef(null);

    useEffect(() => {
        if (ref.current) {
            ref.current.scrollTop = 0;
        }
    }, [activeTab]);

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
                <Tabs
                    className="w-full flex flex-col gap-2 h-full"
                    value={activeTab}
                    onValueChange={(value) => setActiveTab(value)}
                >
                    <TabsList className="w-full block sm:hidden">
                        <TabsTrigger value="input" className="w-1/2">
                            Input
                        </TabsTrigger>
                        <TabsTrigger value="output" className="w-1/2">
                            Output
                        </TabsTrigger>
                    </TabsList>
                    <div
                        className="md:flex md:flex-row md:gap-6 grow overflow-auto"
                        ref={ref}
                    >
                        <div
                            className={classNames(
                                activeTab === "input"
                                    ? "block"
                                    : "hidden sm:block",
                                "md:basis-6/12 overflow-auto",
                            )}
                        >
                            <div className="space-y-4">
                                <WorkspaceInput
                                    onRunMany={(text, promptIds, files) =>
                                        async () => {
                                            setError(null);
                                            await Promise.all(
                                                promptIds.map(
                                                    async (promptId) => {
                                                        try {
                                                            const runParams = {
                                                                promptId,
                                                                systemPrompt:
                                                                    workspace?.systemPrompt,
                                                                workspaceId:
                                                                    workspace?._id,
                                                                text,
                                                            };

                                                            // Add files if provided
                                                            if (
                                                                files &&
                                                                files.length > 0
                                                            ) {
                                                                runParams.files =
                                                                    files;
                                                            }

                                                            await createRun.mutateAsync(
                                                                runParams,
                                                            );
                                                        } catch (error) {
                                                            setError(error);
                                                        }
                                                    },
                                                ),
                                            );
                                            setActiveTab("output");
                                        }}
                                    onRun={async (text, prompt, files) => {
                                        setError(null);
                                        try {
                                            const runParams = {
                                                promptId: prompt._id,
                                                systemPrompt:
                                                    workspace?.systemPrompt,
                                                workspaceId: workspace?._id,
                                                text,
                                            };

                                            // Add files if provided
                                            if (files && files.length > 0) {
                                                runParams.files = files;
                                            }

                                            await createRun.mutateAsync(
                                                runParams,
                                            );
                                            setActiveTab("output");
                                        } catch (error) {
                                            setError(error);
                                        }
                                    }}
                                />
                            </div>
                        </div>
                        <div
                            className={classNames(
                                activeTab === "output"
                                    ? "block"
                                    : "hidden sm:block",
                                "md:basis-6/12 overflow-auto",
                            )}
                        >
                            {outputs?.length > 0 && (
                                <>
                                    <div className="flex flex-col">
                                        <div className="flex justify-between">
                                            <h4 className="text-lg font-medium mb-4">
                                                {t("Outputs")}
                                            </h4>
                                            <div>
                                                <LoadingButton
                                                    text="Deleting"
                                                    onClick={() =>
                                                        setDeleteAllDialogOpen(
                                                            true,
                                                        )
                                                    }
                                                    className="lb-sm lb-outline-secondary"
                                                >
                                                    {t("Delete all")}
                                                </LoadingButton>
                                            </div>
                                        </div>

                                        <div className="text-gray-400 text-sm">
                                            Outputs will be automatically
                                            deleted after 15 days
                                        </div>
                                        <div className="grow overflow-auto">
                                            <WorkspaceOutputs
                                                outputs={outputs}
                                                onDelete={async (id) => {
                                                    await deleteRun.mutateAsync(
                                                        { id },
                                                    );
                                                }}
                                            />
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </Tabs>

                <AlertDialog
                    open={deleteAllDialogOpen}
                    onOpenChange={setDeleteAllDialogOpen}
                >
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>
                                {t("Delete All Outputs")}
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                                {t(
                                    "Are you sure you want to delete all outputs?",
                                )}
                                <br />
                                <span className="text-red-600 font-medium">
                                    {t("This action cannot be undone.")}
                                </span>
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>{t("Cancel")}</AlertDialogCancel>
                            <AlertDialogAction
                                onClick={async () => {
                                    setDeleteAllDialogOpen(false);
                                    await deleteWorkspaceRuns.mutateAsync({
                                        id: workspace?._id,
                                    });
                                }}
                                disabled={deleteWorkspaceRuns.isPending}
                            >
                                {deleteWorkspaceRuns.isPending
                                    ? t("Deleting...")
                                    : t("Delete All")}
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </>
        </WorkspaceContext.Provider>
    );
}

export const WorkspaceContext = createContext();
