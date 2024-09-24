import {
    dehydrate,
    HydrationBoundary,
    QueryClient,
} from "@tanstack/react-query";
import { getCurrentUser } from "../../api/utils/auth";
import PathwayDetails from "./components/PathwayDetails";

export default async function Page({ params }) {
    const id = params.id;

    const user = await getCurrentUser();
    const queryClient = new QueryClient();

    await queryClient.prefetchQuery({
        queryKey: ["pathway", id], // Use the same query key
        queryFn: async () => {
            const { data } = await axios.get(`/api/pathways/${id}`); // Use the same query function
            return data;
        },
        staleTime: Infinity,
    });

    return (
        <HydrationBoundary state={dehydrate(queryClient)}>
            <PathwayDetails id={id} />
        </HydrationBoundary>
    );
}

