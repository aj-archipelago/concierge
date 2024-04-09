import { getTaxonomySets, getTags, getTopics } from "./data/taxonomySets";
import { getSidebarLogo } from "./global/sidebar";
import { getTosContent } from "./global/tos";

// The entire Labeeb application can be configured here
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

export default {
    global: {
        siteTitle: "Concierge",
        getLogo: () => "/app/assets/logo.png",
        getTosContent,
        getSidebarLogo,
        initialize: async () => {},
    },
    data: {
        getTaxonomySets,
        getTopics,
        getTags,
        llms: [
            {
                name: "GPT 3.5 Turbo",
                cortexPathwayName: "run_gpt35turbo",
                isDefault: true,
            },
            {
                name: "GPT 4.0",
                cortexPathwayName: "run_gpt4",
            },
            {
                name: "GPT 4.0 32k",
                cortexPathwayName: "run_gpt4_32",
            },
            {
                name: "Claude 3 Haiku",
                cortexPathwayName: "run_claude3_haiku",
            },
            {
                name: "Claude 3 Sonnet",
                cortexPathwayName: "run_claude3_haiku",
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
