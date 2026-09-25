import { getClient as baseGetClient } from "../../../src/graphql.js";
import { cortexGrantFetch } from "./cortex-grants.mjs";
import { grantsEnabled } from "./storage-grants.mjs";
export * from "../../../src/graphql.js";
export const getClient = (...args) => {
    if (!grantsEnabled()) return baseGetClient(...args);
    const [serverUrl, useBlueGraphQL, options = {}] = args;
    return baseGetClient(serverUrl, useBlueGraphQL, {
        ...options,
        fetch: cortexGrantFetch,
    });
};
