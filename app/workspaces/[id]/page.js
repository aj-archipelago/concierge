import {
    dehydrate,
    HydrationBoundary,
    QueryClient,
} from "@tanstack/react-query";
import { getCurrentUser } from "../../api/utils/auth";
import WorkspaceContent from "../components/WorkspaceContent";
import WorkspaceActions from "./components/WorkspaceActions";
import { getWorkspace } from "../../api/workspaces/[id]/db";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import WorkspaceUI from "./components/WorkspaceUI";

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
                    <Tabs defaultValue="prompts" className="w-full">
                        <TabsList className="w-full justify-start">
                            <TabsTrigger value="prompts">Prompts</TabsTrigger>
                            <TabsTrigger value="ui">UI</TabsTrigger>
                        </TabsList>
                        <TabsContent value="prompts">
                            <WorkspaceContent idOrSlug={id} user={user} />
                        </TabsContent>
                        <TabsContent value="ui">
                            <WorkspaceUI />
                        </TabsContent>
                    </Tabs>
                </div>
            </div>
        </HydrationBoundary>
    );
}
