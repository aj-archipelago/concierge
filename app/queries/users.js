import { useMutation } from "@apollo/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";

export function useCurrentUser() {
    const query = useQuery({
        queryKey: ["currentUser"],
        queryFn: async ({ queryKey }) => {
            const { data } = await axios.get(`/api/users/me`);
            return data;
        },
        staleTime: Infinity,
    });

    return query;
}

export function useUpdateCurrentUser() {
    const queryClient = useQueryClient();

    const mutation = useMutation({
        mutationFn: async ({ data }) => {
            // insert mutation code
            // const response = await axios.put(`/api/users/me`, data);
            // return response.data;
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ["currentUser"] });
        },
    });

    return mutation;
}
