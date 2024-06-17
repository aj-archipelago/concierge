import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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

export function useUserState() {
    const query = useQuery({
        queryKey: ["userState"],
        queryFn: async () => {
            const { data } = await axios.get(`/api/users/me/state`);
            return data;
        },
        staleTime: Infinity,
    });

    return query;
}

export function useUpdateUserState() {
    const queryClient = useQueryClient();

    const mutation = useMutation({
        mutationFn: async (data) => {
            const response = await axios.put(`/api/users/me/state`, data);
            return response.data;
        },
        onMutate: async ({ data }) => {
            await queryClient.cancelQueries({ queryKey: ["userState"] });
            const previousUserState = await queryClient.getQueryData([
                "userState",
            ]);

            queryClient.setQueryData(["userState"], (old) => {
                return {
                    ...old,
                    ...data,
                };
            });

            return { previousUserState };
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ["userState"] });
        },
    });

    return mutation;
}
