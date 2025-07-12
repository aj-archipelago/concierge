import {
    dehydrate,
    HydrationBoundary,
    QueryClient,
} from "@tanstack/react-query";
import { getCurrentUser } from "../../api/utils/auth";
import WorkspaceActions from "./components/WorkspaceActions";
import { getWorkspace } from "../../api/workspaces/[id]/db";
import WorkspaceTabs from "./components/WorkspaceTabs";

export default async function Page({ params }) {
    const id = params.id;

    const user = await getCurrentUser();
    const queryClient = new QueryClient();

    await queryClient.prefetchQuery({
        queryKey: ["workspace", id],
        queryFn: async () => {
            return (await getWorkspace(id)).toJSON();
        },
        staleTime: Infinity,
    });

    return (
        <HydrationBoundary state={dehydrate(queryClient)}>
            <div className="flex flex-col h-full">
                <WorkspaceActions idOrSlug={id} user={user} />
                <div className="h-full overflow-auto">
                    <WorkspaceTabs idOrSlug={id} user={user} />
                </div>
            </div>
        </HydrationBoundary>
    );
}
