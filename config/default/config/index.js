import { getTaxonomySets, getTags, getTopics } from "./data/taxonomySets";
import { getSidebarLogo } from "./global/sidebar";
import { getTosContent } from "./global/tos";
import { getPrivacyContent } from "./global/privacy";

// The entire Labeeb application can be configured here
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

// THESE STRINGS CANNOT BE CHANGED.
// If an identifier ceases to be in this list, the system
// will assume that the LLM no longer exists and assign
// the default LLM to any prompts that were using that LLM.
const LLM_IDENTIFIERS = {
    gpt35turbo: "gpt35turbo",
    gpt4o: "gpt4o",
    gpt4omini: "gpt4omini",
    gpt4: "gpt4",
    gpt41: "gpt41",
    gpt41mini: "gpt41mini",
    gpt41nano: "gpt41nano",
    gpt5: "gpt5",
    gpt5mini: "gpt5mini",
    gpt5nano: "gpt5nano",
    gpt5chat: "gpt5chat",
    gpt432k: "gpt432k",
    claude3haiku: "claude3haiku",
    claude35sonnet: "claude35sonnet",
    claude3opus: "claude3opus",
    o1: "o1",
    o3mini: "o3mini",
    o3: "o3",
    gemini20flash: "gemini20flash",
    gemini25pro: "gemini25pro",
};

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
        llms: [
            {
                identifier: LLM_IDENTIFIERS.gpt35turbo,
                name: "GPT 3.5 Turbo",
                cortexPathwayName: "run_gpt35turbo",
                cortexModelName: "oai-gpturbo",
                isDefault: false,
            },
            {
                identifier: LLM_IDENTIFIERS.gpt4o,
                name: "GPT 4o",
                cortexPathwayName: "run_gpt4_o",
                cortexModelName: "oai-gpt4o",
                isDefault: true,
            },
            {
                identifier: LLM_IDENTIFIERS.gpt4omini,
                name: "GPT 4o Mini",
                cortexPathwayName: "run_gpt4_o_mini",
                cortexModelName: "oai-gpt4o-mini",
            },
            {
                identifier: LLM_IDENTIFIERS.gpt4,
                name: "GPT 4.0",
                cortexPathwayName: "run_gpt4",
                cortexModelName: "oai-gpt4",
            },
            {
                identifier: LLM_IDENTIFIERS.gpt41,
                name: "GPT 4.1",
                cortexPathwayName: "run_gpt41",
                cortexModelName: "oai-gpt41",
            },
            {
                identifier: LLM_IDENTIFIERS.gpt41mini,
                name: "GPT 4.1 Mini",
                cortexPathwayName: "run_gpt41_mini",
                cortexModelName: "oai-gpt41-mini",
            },
            {
                identifier: LLM_IDENTIFIERS.gpt41nano,
                name: "GPT 4.1 Nano",
                cortexPathwayName: "run_gpt41_nano",
                cortexModelName: "oai-gpt41-nano",
            },
            {
                identifier: LLM_IDENTIFIERS.gpt5,
                name: "GPT 5",
                cortexPathwayName: "run_gpt5",
                cortexModelName: "oai-gpt5",
            },
            {
                identifier: LLM_IDENTIFIERS.gpt5mini,
                name: "GPT 5 Mini",
                cortexPathwayName: "run_gpt5_mini",
                cortexModelName: "oai-gpt5-mini",
            },
            {
                identifier: LLM_IDENTIFIERS.gpt5nano,
                name: "GPT 5 Nano",
                cortexPathwayName: "run_gpt5_nano",
                cortexModelName: "oai-gpt5-nano",
            },
            {
                identifier: LLM_IDENTIFIERS.gpt5chat,
                name: "GPT 5 Chat",
                cortexPathwayName: "run_gpt5_chat",
                cortexModelName: "oai-gpt5-chat",
            },
            {
                identifier: LLM_IDENTIFIERS.claude35sonnet,
                name: "Claude 3.5 Sonnet",
                cortexPathwayName: "run_claude35_sonnet",
                cortexModelName: "claude-35-sonnet-vertex",
            },
            {
                identifier: LLM_IDENTIFIERS.o1,
                name: "o1",
                cortexPathwayName: "run_o1",
                cortexModelName: "oai-o1",
            },
            {
                identifier: LLM_IDENTIFIERS.o3mini,
                name: "o3 Mini",
                cortexPathwayName: "run_o3_mini",
                cortexModelName: "oai-o3-mini",
            },
            {
                identifier: LLM_IDENTIFIERS.o3,
                name: "o3",
                cortexPathwayName: "run_o3",
                cortexModelName: "oai-o3",
            },
            {
                identifier: LLM_IDENTIFIERS.gemini20flash,
                name: "Gemini 2.0 Flash",
                cortexPathwayName: "run_gemini_20_flash",
                cortexModelName: "gemini-flash-20-vision",
            },
            {
                identifier: LLM_IDENTIFIERS.gemini25pro,
                name: "Gemini 2.5 Pro",
                cortexPathwayName: "run_gemini_25_pro",
                cortexModelName: "gemini-pro-25-vision",
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
    endpoints: {
        mediaHelper: (serverUrl) => `${serverUrl}${basePath}/media-helper`,
        graphql: (serverUrl, useBlueGraphQL) => {
            if (useBlueGraphQL) {
                return `${serverUrl}${basePath}/graphql-blue`;
            }
            return `${serverUrl}${basePath}/graphql`;
        },
    },
    auth: {
        provider: null, // only one value is supported: "entra"
    },
};
