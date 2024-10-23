import { getTaxonomySets, getTags, getTopics } from "./data/taxonomySets";
import { getSidebarLogo } from "./global/sidebar";
import { getTosContent } from "./global/tos";

// The entire Labeeb application can be configured here
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

// eslint-disable-next-line import/no-anonymous-default-export
export default {
    global: {
        siteTitle: "Concierge",
        getLogo: () => "/app/assets/logo.png",
        getTosContent,
        getSidebarLogo,
        initialize: async () => {},
        getPublicGraphQLEndpoint: (graphQLEndpoint) => graphQLEndpoint,
    },
    data: {
        getTaxonomySets,
        getTopics,
        getTags,
        llms: [
            {
                name: "GPT 3.5 Turbo",
                cortexPathwayName: "run_gpt35turbo",
                cortexModelName: "azure-turbo-chat",
                isDefault: true,
            },
            {
                name: "GPT 4o",
                cortexPathwayName: "run_gpt4_o",
                cortexModelName: "azure-gpt4-omni",
            },
            {
                name: "GPT 4.0",
                cortexPathwayName: "run_gpt4",
                cortexModelName: "azure-gpt4",
            },
            {
                name: "GPT 4.0 Mini",
                cortexPathwayName: "run_gpt4_o_mini",
            },
            {
                name: "GPT 4.0 32k",
                cortexPathwayName: "run_gpt4_32",
                cortexModelName: "azure-gpt4-32",
            },
            {
                name: "Claude 3 Haiku",
                cortexPathwayName: "run_claude3_haiku",
                cortexModelName: "claude-3-haiku-vertex",
            },
            {
                name: "Claude 3.5 Sonnet",
                cortexPathwayName: "run_claude35_sonnet",
                cortexModelName: "claude-35-sonnet-vertex",
            },
            {
                name: "Claude 3 Opus",
                cortexPathwayName: "run_claude3_opus",
                cortexModelName: "claude-3-opus-vertex",
            },
        ],
    },
    write: {
        actions: {},
    },
    chat: {
        botName: "Jarvis",
        dataSources: [],
    },
    code: {
        botName: "Knuth",
    },
    endpoints: {
        mediaHelper: (serverUrl) => `${serverUrl}${basePath}/media-helper`,
        graphql: (serverUrl) => `${serverUrl}${basePath}/graphql`,
    },
    auth: {
        provider: null, // only one value is supported: "entra"
    },
};
