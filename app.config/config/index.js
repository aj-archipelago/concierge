import { getTosContent } from "./global/tos";
import { getSidebarLogo } from "./global/sidebar";
import { FaFileImport } from "react-icons/fa";
import { ImportSuggestions } from "./write/actions/ImportSuggestions";
import { getTags, getTaxonomySets, getTopics } from "./data/taxonomySets";
import { basePath } from "../../src/utils/constants";
import { fetchUrlSource } from "./transcribe/TranscribeUrlConstants";

const cortexURLs = {
    dev: "https://cortex.aljazeera.com/dev/graphql?subscription-key=<your key>",
    prod: "https://cortex.aljazeera.com/graphql?subscription-key=<your key>",
};

// The entire Labeeb application can be configured here
// Note that all assets and locales are copied to the public/app and src/locales directories respectively
// by the prebuild.js script
export default {
    global: {
        siteTitle: "Labeeb",
        getLogo: (language) =>
            (basePath || "") +
            `/app/assets/labeeb-logo-${language === "ar" ? "ar" : "en"}.png`,
        getTosContent,
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
    },
    write: {
        actions: {
            import: {
                Icon: FaFileImport,
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
    code: {
        botName: "Knuth",
    },
    transcribe: {
        fetchUrlSource,
    },
    auth: {
        provider: "entra",
    },
};
