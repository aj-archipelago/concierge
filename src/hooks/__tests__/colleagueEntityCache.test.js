import React from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import {
    ApolloClient,
    ApolloProvider,
    InMemoryCache,
    ApolloLink,
    Observable,
} from "@apollo/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import axios from "axios";
import { useEntities } from "../useEntities";
import { useSaveColleague } from "../useColleagues";
import { useChatEntitySelection } from "../useChatEntitySelection";
import { SYS_GET_ENTITIES } from "../../graphql";

jest.mock("axios");
jest.mock("../../App", () => ({
    CurrentUserContext: require("react").createContext({ _id: "user-1" }),
}));
jest.mock("../../graphql", () => {
    const { gql } = jest.requireActual("@apollo/client");
    return {
        SYS_GET_ENTITIES: gql`
            query Sys_get_entities(
                $userId: String
                $fresh: String
                $entityId: String
                $query: String
            ) {
                sys_get_entities(
                    userId: $userId
                    fresh: $fresh
                    entityId: $entityId
                    query: $query
                ) {
                    result
                }
            }
        `,
    };
});

const personal = { id: "personal-1", name: "Personal", isDefault: true };
const colleague = { id: "colleague-1", name: "Colleague" };
const variables = {
    userId: "user-1",
    fresh: "true",
    entityId: personal.id,
    query: "",
};
const dataFor = (entities) => ({
    sys_get_entities: {
        __typename: "EntityList",
        result: JSON.stringify(entities),
    },
});
let apollo;
let queries;
let requests;
let wrapper;
beforeEach(() => {
    requests = [];
    apollo = new ApolloClient({
        cache: new InMemoryCache(),
        link: new ApolloLink(
            (operation) =>
                new Observable((observer) => {
                    requests.push({ operation, observer });
                }),
        ),
    });
    apollo.writeQuery({
        query: SYS_GET_ENTITIES,
        variables,
        data: dataFor([personal]),
    });
    queries = new QueryClient({
        defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
        },
    });
    wrapper = ({ children }) => (
        <ApolloProvider client={apollo}>
            <QueryClientProvider client={queries}>
                {children}
            </QueryClientProvider>
        </ApolloProvider>
    );
});
afterEach(() => {
    apollo.stop();
    queries.clear();
    jest.clearAllMocks();
});
const reply = (request, entities) => {
    request.observer.next({ data: dataFor(entities) });
    request.observer.complete();
};
const useListing = () =>
    useEntities("Personal", {
        userId: "user-1",
        personalEntityId: personal.id,
    });

it("keeps a persisted colleague while Apollo emits a stale cache result before its network response", async () => {
    const updateChat = jest.fn();
    const { result } = renderHook(
        () => {
            const listing = useListing();
            const selection = useChatEntitySelection({
                ...listing,
                chat: { _id: "chat-1", selectedEntityId: colleague.id },
                updateChat,
            });
            return { ...listing, ...selection };
        },
        { wrapper },
    );
    await waitFor(() => expect(requests).toHaveLength(1));
    expect(result.current.entities).toEqual([personal]);
    expect(result.current.entitiesLoaded).toBe(false);
    expect(result.current.selectedEntityId).toBe(colleague.id);
    act(() => reply(requests[0], [personal, colleague]));
    await waitFor(() => expect(result.current.entitiesLoaded).toBe(true));
    expect(result.current.selectedEntityId).toBe(colleague.id);
    expect(updateChat).not.toHaveBeenCalled();
});

it("refetches the active Apollo listing from Cortex after creating a colleague", async () => {
    axios.post.mockResolvedValue({ data: colleague });
    const { result } = renderHook(
        () => ({ listing: useListing(), save: useSaveColleague() }),
        { wrapper },
    );
    await waitFor(() => expect(requests).toHaveLength(1));
    act(() => reply(requests[0], [personal]));
    await waitFor(() =>
        expect(result.current.listing.entitiesLoaded).toBe(true),
    );
    let savePromise;
    act(() => {
        savePromise = result.current.save.mutateAsync({ name: colleague.name });
    });
    await waitFor(() => expect(requests).toHaveLength(2));
    expect(requests[1].operation.variables).toEqual(variables);
    await act(async () => {
        reply(requests[1], [personal, colleague]);
        await savePromise;
    });
    await waitFor(() =>
        expect(result.current.listing.entities).toContainEqual(colleague),
    );
});

it("evicts inactive Apollo listings after saving settings", async () => {
    axios.patch.mockResolvedValue({ data: colleague });
    const { result } = renderHook(useSaveColleague, { wrapper });
    expect(
        apollo.readQuery({ query: SYS_GET_ENTITIES, variables }),
    ).not.toBeNull();
    await act(async () => {
        await result.current.mutateAsync({ id: colleague.id, name: "Renamed" });
    });
    expect(apollo.readQuery({ query: SYS_GET_ENTITIES, variables })).toBeNull();
});

it("fetches an off-page assistant and the personal assistant by ID without a directory request", async () => {
    const specialist = { id: "colleague-9999", name: "Deep specialist" };
    const { result } = renderHook(
        () =>
            useEntities("Personal", {
                userId: "user-1",
                personalEntityId: personal.id,
                selectedEntityId: specialist.id,
            }),
        { wrapper },
    );
    await waitFor(() => expect(requests).toHaveLength(2));
    expect(
        requests.every((request) =>
            Boolean(request.operation.variables.entityId),
        ),
    ).toBe(true);
    act(() =>
        requests.forEach((request) =>
            reply(
                request,
                request.operation.variables.entityId === personal.id
                    ? [personal]
                    : [specialist],
            ),
        ),
    );
    await waitFor(() => expect(result.current.entitiesLoaded).toBe(true));
    expect(result.current.entities).toContainEqual(specialist);
    expect(result.current.defaultEntityId).toBe(personal.id);
});
