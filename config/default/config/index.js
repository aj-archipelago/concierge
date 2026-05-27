import { getTaxonomySets, getTags, getTopics } from "./data/taxonomySets.js";
import { getSidebarLogo } from "./global/sidebar.js";
import { getTosContent } from "./global/tos.js";
import { getPrivacyContent } from "./global/privacy.js";
import { DEFAULT_CHAT_MODEL } from "../../../src/utils/constants.js";

// The entire Concierge application can be configured here
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

// eslint-disable-next-line import/no-anonymous-default-export
export default {
    global: {
        siteTitle: "Concierge",
        getLogo: () => "/app/assets/logo.png",
        getTosContent,
        getPrivacyContent,
        getSidebarLogo,
        initialize: async () => {},
        getPublicGraphQLEndpoint: (graphQLEndpoint) => graphQLEndpoint,
    },
    data: {
        getTaxonomySets,
        getTopics,
        getTags,
    },
    write: {
        actions: {},
    },
    chat: {
        botName: "Jarvis",
        dataSources: [],
    },
    cortex: {
        AGENTIC_MODEL: DEFAULT_CHAT_MODEL,
        defaultChatModel: DEFAULT_CHAT_MODEL,
    },
    endpoints: {
        mediaHelper: (serverUrl) => `${serverUrl}${basePath}/media-helper`,
        graphql: (serverUrl, useBlueGraphQL) => {
            if (useBlueGraphQL) {
                return `${serverUrl}${basePath}/graphql-blue`;
            }
            return `${serverUrl}${basePath}/graphql`;
        },
        mediaHelperDirect: () => process.env.CORTEX_MEDIA_API_URL,
    },
    auth: {
        provider: null, // only one value is supported: "entra"
    },
};
