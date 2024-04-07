"use client";

import { useRouter } from "next/navigation";
import LoadingButton from "../../../src/components/editor/LoadingButton";
import Loader from "../../components/loader";
import { useCreateWorkspace, useWorkspaces } from "../../queries/workspaces";
import { useTranslation } from "react-i18next";

export default function Workspaces() {
    const router = useRouter();
    const { data: workspaces, isLoading } = useWorkspaces();
    const createWorkspace = useCreateWorkspace();
    const { t } = useTranslation();

    const handleCreate = async () => {
        const workspace = await createWorkspace.mutateAsync({
            name: t("New Workspace"),
        });
        router.push(`/workspaces/${workspace._id}`);
    };

    if (isLoading) {
        return <Loader />;
    }

    return (
        <div>
            <h1 className="text-xl font-medium mb-3">{t("Workspaces")}</h1>

            <p className="mb-3">
                {t("Create workspaces to organize and share your prompts")}
            </p>
            <div className="flex flex-wrap gap-4">
                {workspaces.map((workspace) => (
                    <WorkspaceTile
                        key={workspace._id}
                        onClick={() =>
                            router.push(`/workspaces/${workspace._id}`)
                        }
                    >
                        {workspace.name || "Workspace " + workspace._id}
                    </WorkspaceTile>
                ))}
                <LoadingButton
                    text={t("Creating") + "..."}
                    className="border border-dashed rounded w-64 h-12 p-6 flex items-center hover:bg-gray-50 active:bg-gray-100"
                    loading={createWorkspace.isPending}
                    onClick={handleCreate}
                >
                    + {t("Create workspace")}
                </LoadingButton>
            </div>
        </div>
    );
}

function WorkspaceTile({ children, onClick }) {
    return (
        <button
            className="white-button w-64 h-12 p-6 border rounded flex items-center "
            onClick={onClick}
        >
            {children}
        </button>
    );
}
