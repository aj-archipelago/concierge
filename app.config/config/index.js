import { getTosContent } from "./global/tos";
import { getSidebarLogo } from "./global/sidebar";
import { FaFileImport } from "react-icons/fa";
import { ImportSuggestions } from "./write/actions/ImportSuggestions";
import { getTags, getTaxonomySets, getTopics, initializeTaxonomies } from "./data/taxonomySets";
import { basePath } from "../../src/utils/constants";

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
        initialize: async () => {
            await initializeTaxonomies();
        }
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
    auth: {
        provider: "entra",
    },
};
