import {
    dehydrate,
    HydrationBoundary,
    QueryClient,
} from "@tanstack/react-query";
import { getCurrentUser } from "../../api/utils/auth";
import WorkspaceContent from "../components/WorkspaceContent";
import WorkspaceActions from "./components/WorkspaceActions";
import { getWorkspace } from "../../api/workspaces/[id]/db";

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
                <div>
                    <WorkspaceActions idOrSlug={id} user={user} />
                </div>
                <WorkspaceContent idOrSlug={id} user={user} />
            </div>
        </HydrationBoundary>
    );
}
