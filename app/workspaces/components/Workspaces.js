"use client";

import { useRouter } from "next/navigation";
import LoadingButton from "../../../src/components/editor/LoadingButton";
import Loader from "../../components/loader";
import { useCreateWorkspace, useWorkspaces } from "../../queries/workspaces";

export default function Workspaces() {
    const router = useRouter();
    const { data: workspaces, isLoading } = useWorkspaces();
    const createWorkspace = useCreateWorkspace();

    const handleCreate = async () => {
        const workspace = await createWorkspace.mutateAsync({});
        router.push(`/workspaces/${workspace._id}`);
    };

    if (isLoading) {
        return <Loader />;
    }

    return (
        <div>
            <h1 className="text-xl font-medium mb-3">Workspaces</h1>

            <p className="mb-3">
                Create workspaces to organize and share your prompts.
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
                    text="Creating..."
                    className="border border-dashed rounded w-64 h-64 p-6 flex items-center justify-center hover:bg-gray-50 active:bg-gray-100"
                    loading={createWorkspace.isLoading}
                    onClick={handleCreate}
                >
                    + Create new workspace
                </LoadingButton>
            </div>
        </div>
    );
}

function WorkspaceTile({ children, onClick }) {
    return (
        <button
            className="white-button w-64 h-64 p-6 border rounded flex items-center justify-center"
            onClick={onClick}
        >
            {children}
        </button>
    );
}
