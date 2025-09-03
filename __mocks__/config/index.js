const taxonomySets = [
    {
        setName: "news",
        topics: [],
        tags: [],
    },
];

const LLM_IDENTIFIERS = {
    gpt35turbo: "gpt35turbo",
    gpt4o: "gpt4o",
    gpt4omini: "gpt4omini",
    gpt4: "gpt4",
    gpt432k: "gpt432k",
    claude3haiku: "claude3haiku",
    claude35sonnet: "claude35sonnet",
    claude3opus: "claude3opus",
    o1: "o1",
    o3mini: "o3mini",
};

export default {
    global: {
        siteTitle: "Labeeb",
        getLogo: (language) =>
            `/app/assets/labeeb-logo-${language === "ar" ? "ar" : "en"}.png`,
        getTosContent: async () => "",
        getSidebarLogo: () => "/app/assets/sidebar-logo.png",
        getPublicGraphQLEndpoint: (graphQLEndpoint) => graphQLEndpoint,
    },
    data: {
        getTaxonomySets: async () => taxonomySets,
        getTopics: async () => [],
        getTags: async () => [],
        llms: [
            {
                identifier: LLM_IDENTIFIERS.gpt4o,
                name: "GPT 4o",
                cortexPathwayName: "run_workspace_prompt",
                cortexModelName: "oai-gpt4o",
                isDefault: true,
            },
            {
                name: "GPT-3.5 Turbo",
                cortexModelName: "azure-turbo-chat",
                cortexPathwayName: "run_workspace_prompt",
                identifier: LLM_IDENTIFIERS.gpt35turbo,
                isDefault: false,
            },
            {
                name: "GPT-4",
                cortexModelName: "azure-gpt4",
                cortexPathwayName: "run_workspace_prompt",
                identifier: LLM_IDENTIFIERS.gpt4,
                isDefault: false,
            },
        ],
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
    auth: {
        provider: "entra",
    },
};
