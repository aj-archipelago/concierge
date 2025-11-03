import { getTosContent } from "./global/tos";
import { getPrivacyContent } from "./global/privacy";
import { getSidebarLogo } from "./global/sidebar";
import { FileDown } from "lucide-react";
import { ImportSuggestions } from "./write/actions/ImportSuggestions";
import { getTags, getTaxonomySets, getTopics } from "./data/taxonomySets";
import { basePath } from "../../src/utils/constants";
import { fetchUrlSource } from "./transcribe/TranscribeUrlConstants";

const cortexURLs = {
    dev: "https://cortex.aljazeera.com/dev/graphql?subscription-key=<your key>",
    prod: "https://cortex.aljazeera.com/graphql?subscription-key=<your key>",
};

// THESE STRINGS CANNOT BE CHANGED.
// If an identifier ceases to be in this list, the system
// will assume that the LLM no longer exists and assign
// the default LLM to any prompts that were using that LLM.
const LLM_IDENTIFIERS = {
    gpt4o: "gpt4o",
    gpt41: "gpt41",
    gpt41mini: "gpt41mini",
    gpt41nano: "gpt41nano",
    gpt5: "gpt5",
    gpt5chat: "gpt5chat",
    gpt5mini: "gpt5mini",
    gpt5nano: "gpt5nano",
    o3: "o3",
    gemini25pro: "gemini25pro",
    gemini25flash: "gemini25flash",
    claude37sonnet: "claude37sonnet",
    claude4sonnet: "claude4sonnet",
    claude45haiku: "claude45haiku",
    claude45sonnet: "claude45sonnet",
    claude41opus: "claude41opus",
    grok4azure: "grok4azure",
    grok4fastreasoningazure: "grok4fastreasoningazure",
    grok4fastnonreasoningazure: "grok4fastnonreasoningazure",
    labeebagent: "labeebagent",
};

// The entire Labeeb application can be configured here
// Note that all assets and locales are copied to the public/app and src/locales directories respectively
// by the prebuild.js script
const config = {
    global: {
        siteTitle: "Labeeb",
        getLogo: (language) =>
            (basePath || "") +
            `/app/assets/labeeb-logo-${language === "ar" ? "ar" : "en"}.png`,
        getTosContent,
        getPrivacyContent,
        getSidebarLogo,
        getPublicGraphQLEndpoint: (graphQLEndpoint = "") => {
            if (graphQLEndpoint.includes("cortex-internal-dev")) {
                return cortexURLs["dev"];
            } else if (graphQLEndpoint.includes("cortex-internal")) {
                return cortexURLs["prod"];
            }

            return graphQLEndpoint;
        },
    },
    data: {
        getTaxonomySets,
        getTopics,
        getTags,
        llms: [
            // OpenAI
            {
                identifier: LLM_IDENTIFIERS.gpt4o,
                name: "GPT 4o",
                cortexPathwayName: "run_workspace_prompt",
                cortexModelName: "oai-gpt4o",
                isDefault: true,
            },
            {
                identifier: LLM_IDENTIFIERS.gpt41,
                name: "GPT 4.1",
                cortexPathwayName: "run_workspace_prompt",
                cortexModelName: "oai-gpt41",
            },
            {
                identifier: LLM_IDENTIFIERS.gpt41mini,
                name: "GPT 4.1 Mini",
                cortexPathwayName: "run_workspace_prompt",
                cortexModelName: "oai-gpt41-mini",
            },
            {
                identifier: LLM_IDENTIFIERS.gpt41nano,
                name: "GPT 4.1 Nano",
                cortexPathwayName: "run_workspace_prompt",
                cortexModelName: "oai-gpt41-nano",
            },
            {
                identifier: LLM_IDENTIFIERS.gpt5,
                name: "GPT 5",
                cortexPathwayName: "run_workspace_prompt",
                cortexModelName: "oai-gpt5",
            },
            {
                identifier: LLM_IDENTIFIERS.gpt5chat,
                name: "GPT 5 Chat",
                cortexPathwayName: "run_workspace_prompt",
                cortexModelName: "oai-gpt5-chat",
            },
            {
                identifier: LLM_IDENTIFIERS.gpt5mini,
                name: "GPT 5 Mini",
                cortexPathwayName: "run_workspace_prompt",
                cortexModelName: "oai-gpt5-mini",
            },
            {
                identifier: LLM_IDENTIFIERS.gpt5nano,
                name: "GPT 5 Nano",
                cortexPathwayName: "run_workspace_prompt",
                cortexModelName: "oai-gpt5-nano",
            },
            {
                identifier: LLM_IDENTIFIERS.o3,
                name: "o3",
                cortexPathwayName: "run_workspace_prompt",
                cortexModelName: "oai-o3",
            },
            // Google
            {
                identifier: LLM_IDENTIFIERS.gemini25pro,
                name: "Gemini 2.5 Pro",
                cortexPathwayName: "run_workspace_prompt",
                cortexModelName: "gemini-pro-25-vision",
            },
            {
                identifier: LLM_IDENTIFIERS.gemini25flash,
                name: "Gemini 2.5 Flash",
                cortexPathwayName: "run_workspace_prompt",
                cortexModelName: "gemini-flash-25-vision",
            },
            // Anthropic (Claude)
            {
                identifier: LLM_IDENTIFIERS.claude37sonnet,
                name: "Claude 3.7 Sonnet",
                cortexPathwayName: "run_workspace_prompt",
                cortexModelName: "claude-37-sonnet-vertex",
            },
            {
                identifier: LLM_IDENTIFIERS.claude4sonnet,
                name: "Claude 4 Sonnet",
                cortexPathwayName: "run_workspace_prompt",
                cortexModelName: "claude-4-sonnet-vertex",
            },
            {
                identifier: LLM_IDENTIFIERS.claude45haiku,
                name: "Claude 4.5 Haiku",
                cortexPathwayName: "run_workspace_prompt",
                cortexModelName: "claude-45-haiku-vertex",
            },
            {
                identifier: LLM_IDENTIFIERS.claude45sonnet,
                name: "Claude 4.5 Sonnet",
                cortexPathwayName: "run_workspace_prompt",
                cortexModelName: "claude-45-sonnet-vertex",
            },
            {
                identifier: LLM_IDENTIFIERS.claude41opus,
                name: "Claude 4.1 Opus",
                cortexPathwayName: "run_workspace_prompt",
                cortexModelName: "claude-41-opus-vertex",
            },
            // X.AI (Grok)
            {
                identifier: LLM_IDENTIFIERS.grok4azure,
                name: "Grok 4 Azure",
                cortexPathwayName: "run_workspace_prompt",
                cortexModelName: "xai-grok-4-azure",
            },
            {
                identifier: LLM_IDENTIFIERS.grok4fastreasoningazure,
                name: "Grok 4 Fast Reasoning Azure",
                cortexPathwayName: "run_workspace_prompt",
                cortexModelName: "xai-grok-4-fast-reasoning",
            },
            {
                identifier: LLM_IDENTIFIERS.grok4fastnonreasoningazure,
                name: "Grok 4 Fast Non-Reasoning Azure",
                cortexPathwayName: "run_workspace_prompt",
                cortexModelName: "xai-grok-4-fast-non-reasoning",
            },
            // Labeeb
            {
                identifier: LLM_IDENTIFIERS.labeebagent,
                name: "Labeeb Agent",
                cortexPathwayName: "run_labeeb_agent",
                cortexModelName: "labeeb-agent",
                isAgentic: true,
            },
        ],
    },
    write: {
        actions: {
            import: {
                Icon: FileDown,
                type: "always-available",
                title: "Import from UCMS",
                dialogClassName: "modal-narrow",
                commitLabel: "Import",
                SuggestionsComponent: ImportSuggestions,
                postApply: "clear-headline",
            },
        },
    },
    chat: {
        botName: "Labeeb",
        dataSources: [
            {
                key: "wires",
                name: "Wires",
                description: "use wires",
            },
            {
                key: "aja",
                name: "Al Jazeera Arabic articles",
                description: "use aj arabic articles",
            },
            {
                key: "aje",
                name: "Al Jazeera English articles",
                description: "use aj english articles",
            },
        ],
    },
    transcribe: {
        fetchUrlSource,
    },
    auth: {
        provider: process.env.NODE_ENV === "production" ? "entra" : "",
    },
};

export default config;
