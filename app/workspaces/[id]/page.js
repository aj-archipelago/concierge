import {
    dehydrate,
    HydrationBoundary,
    QueryClient,
} from "@tanstack/react-query";
import { getCurrentUser } from "../../api/utils/auth";
import WorkspaceContent from "../components/WorkspaceContent";
import WorkspaceActions from "./components/WorkspaceActions";
import { getWorkspace } from "../../api/workspaces/[id]/queries";

export default async function Page({ params }) {
    const id = params.id;

    const user = await getCurrentUser();
    const queryClient = new QueryClient();

    await queryClient.prefetchQuery({
        queryKey: ["workspaces", id],
        queryFn: async () => {
            return await getWorkspace(id);
            // const workspace = await Workspace.findById(id);

            // for (const promptId of workspace.prompts) {
            //     await queryClient.prefetchQuery({
            //         queryKey: ['prompts', promptId],
            //         queryFn: async () => {
            //             const prompt = await Prompt.findById(promptId);
            //             return JSON.parse(JSON.stringify(prompt));
            //         },
            //         staleTime: 1000 * 60 * 5,
            //     });
            // }
            // return JSON.parse(JSON.stringify(workspace));
        },
        staleTime: 1000 * 60 * 5,
    });

    return (
        <HydrationBoundary state={dehydrate(queryClient)}>
            <div className="flex flex-col h-full">
                <div>
                    <WorkspaceActions id={id} user={user} />
                </div>
                <WorkspaceContent id={id} user={user} />
            </div>
        </HydrationBoundary>
    );
}
