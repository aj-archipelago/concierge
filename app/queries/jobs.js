import { useQuery } from "@tanstack/react-query";
import axios from "../utils/axios-client";

export function useJob(id) {
    return useQuery({
        queryKey: ["jobs", id],
        queryFn: async () => {
            const { data } = await axios.get(`/api/jobs/${id}`);
            return data;
        },
        enabled: !!id,
        refetchInterval: (query) => {
            if (
                query.state.data?.state === "active" ||
                query.state.data?.state === "waiting"
            ) {
                return 5000;
            }
            return false;
        },
        refetchIntervalInBackground: true,
    });
}
