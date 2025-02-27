import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "../utils/axios-client";

export function useGetAutogenRun(codeRequestId) {
    return useQuery({
        queryKey: ["autogenRun", codeRequestId],
        queryFn: async () => {
            const { data } = await axios.get(
                `/api/autogen?codeRequestId=${codeRequestId}`,
            );
            return data.error === "Autogen run not found"
                ? { notFound: true }
                : data;
        },
        enabled: !!codeRequestId,
        refetchInterval: (data) => (data?.data ? false : 30000),
        refetchIntervalInBackground: true,
    });
}

export function useDeleteAutogenRun() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (codeRequestId) => {
            console.log("Deleting autogen run", codeRequestId);
            const { data } = await axios.delete(
                `/api/autogen?codeRequestId=${codeRequestId}`,
            );
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries("autogenRun");
        },
    });
}
