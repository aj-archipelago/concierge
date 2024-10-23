import { useQuery } from "@tanstack/react-query";
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
