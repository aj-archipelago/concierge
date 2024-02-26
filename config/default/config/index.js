import { getTaxonomySets, getTags, getTopics } from "./data/taxonomySets";
import { getSidebarLogo } from "./global/sidebar";
import { getTosContent } from "./global/tos";

// The entire Labeeb application can be configured here

const serverUrl =
    process.env.NEXT_PUBLIC_NEXTJS_SERVER_URL || "http://localhost:3000";
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

export default {
    global: {
        siteTitle: "Concierge",
        getLogo: () => "/app/assets/logo.png",
        getTosContent,
        getSidebarLogo,
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
    code: {
        botName: "Knuth",
    },
    endpoints: {
        mediaHelper: `${serverUrl}${basePath}/media-helper`,
        graphql: `${serverUrl}${basePath}/graphql`,
    },
    auth: {
        provider: null, // only one value is supported: "entra"
    },
};
