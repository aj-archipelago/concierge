import en from "../../config/default/locales/en.json";
import ar from "../../config/default/locales/ar.json";
import defaultEn from "../../config/default/locales/en.json";
import defaultAr from "../../config/default/locales/ar.json";

const PORTAL_KEYS = [
    "portal_title",
    "portal_tab_discover",
    "portal_tab_profile",
    "portal_tab_ai_assistant",
    "portal_tab_memory",
    "portal_tab_capabilities",
    "portal_dialog_description",
    "portal_discover_quick_actions",
    "portal_discover_profile_desc",
    "portal_discover_ai_desc",
    "portal_discover_memory_desc",
    "portal_discover_capabilities_desc",
    "portal_discover_slash_commands",
    "portal_discover_open",
    "portal_discover_slash_hint",
];

describe("portal locale labels", () => {
    it.each(PORTAL_KEYS)("defines %s in en.json", (key) => {
        expect(en[key]).toBeTruthy();
    });

    it.each(PORTAL_KEYS)("defines %s in ar.json", (key) => {
        expect(ar[key]).toBeTruthy();
    });

    it.each(PORTAL_KEYS)("defines %s in default en.json", (key) => {
        expect(defaultEn[key]).toBeTruthy();
    });

    it.each(PORTAL_KEYS)("defines %s in default ar.json", (key) => {
        expect(defaultAr[key]).toBeTruthy();
    });
});
