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
                cortexModelName: "azure-turbo-chat",
                isDefault: true,
            },
            {
                name: "GPT 4.0",
                cortexModelName: "azure-gpt4",
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
