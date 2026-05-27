const taxonomySets = [
    {
        setName: "news",
        topics: [],
        tags: [],
    },
];

const config = {
    global: {
        siteTitle: "Concierge",
        getLogo: () => "/app/assets/logo.png",
        getTosContent: async () => "",
        getSidebarLogo: () => "/app/assets/sidebar-logo.png",
        getPublicGraphQLEndpoint: (graphQLEndpoint) => graphQLEndpoint,
    },
    data: {
        getTaxonomySets: async () => taxonomySets,
        getTopics: async () => [],
        getTags: async () => [],
    },
    write: {
        actions: {},
    },
    chat: {
        botName: "Test Bot",
        dataSources: [],
    },
    endpoints: {
        mediaHelper: (serverUrl) => `${serverUrl}/media-helper`,
        graphql: (serverUrl) => `${serverUrl}/graphql`,
        mediaHelperDirect: () =>
            process.env.CORTEX_MEDIA_API_URL || "http://localhost:3001",
    },
    cortex: {
        AGENTIC_MODEL: "cortex-agent-chat",
        defaultChatModel: "cortex-agent-chat",
    },
    auth: {
        provider: "entra",
    },
};

export default config;
