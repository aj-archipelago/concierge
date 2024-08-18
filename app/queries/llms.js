import { useQuery } from "@tanstack/react-query";
import axios from "../utils/axios-client";

export function useLLM(id) {
    const query = useQuery({
        queryKey: ["llm", id],
        queryFn: async () => {
            const response = await axios.get(`/api/llms/${id}`);
            return response.data;
        },
        staleTime: Infinity,
        enabled: !!id,
    });

    return query;
}

export function useLLMs() {
    return useQuery({
        queryKey: ["llms"],
        queryFn: async () => {
            const response = await axios.get("/api/llms");
            return response.data;
        },
        staleTime: Infinity,
    });
}
