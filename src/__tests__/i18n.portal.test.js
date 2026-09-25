import en from "../../config/default/locales/en.json";
import ar from "../../config/default/locales/ar.json";
import defaultEn from "../../config/default/locales/en.json";
import defaultAr from "../../config/default/locales/ar.json";

const PORTAL_KEYS = [
    "portal_overview_description",
    "portal_profile_description",
    "portal_capabilities_description",
    "portal_appearance",
    "portal_appearance_description",
    "portal_language_description",
    "portal_language_en",
    "portal_language_ar",
    "portal_discover_assistants_desc",
    "portal_connectors_description",
    "portal_skills_description",
    "portal_secrets_description",
    "portal_memory_learning_description",
    "portal_secret_name",
    "portal_secret_show",
    "portal_secret_hide",
    "portal_title",
    "portal_tab_discover",
    "portal_tab_profile",
    "portal_tab_sharing",
    "portal_tab_ai_assistant",
    "portal_tab_memory",
    "portal_tab_capabilities",
    "portal_dialog_description",
    "portal_discover_quick_actions",
    "portal_discover_profile_desc",
    "portal_discover_sharing_desc",
    "portal_discover_ai_desc",
    "portal_discover_memory_desc",
    "portal_discover_capabilities_desc",
    "portal_discover_slash_commands",
    "portal_discover_open",
    "portal_discover_slash_hint",
    "portal_sharing_description",
    "portal_sharing_filter_all",
    "portal_sharing_type_chat",
    "portal_sharing_type_workspace",
    "portal_sharing_type_applet",
    "portal_sharing_type_automation",
    "portal_sharing_link_viewer",
    "portal_sharing_link_editor",
    "portal_sharing_people_count_one",
    "portal_sharing_people_count_other",
    "portal_sharing_open",
    "portal_sharing_loading",
    "portal_sharing_error",
    "portal_sharing_empty_title",
    "portal_sharing_empty_description",
    "portal_sharing_hint",
];

const SHARE_DIALOG_KEYS = [
    "shareDialog.title",
    "shareDialog.description",
    "shareDialog.loading",
    "shareDialog.tab.link",
    "shareDialog.tab.people",
    "shareDialog.entity.chat",
    "shareDialog.entity.workspace",
    "shareDialog.entity.applet",
    "shareDialog.entity.publishedApplet",
    "shareDialog.entity.automation",
    "shareDialog.entity.article",
    "shareDialog.entity.item",
    "shareDialog.anyoneWithLink",
    "shareDialog.linkEnabledDescription",
    "shareDialog.linkDisabledDescription",
    "shareDialog.theyCan",
    "shareDialog.role.view",
    "shareDialog.role.edit",
    "shareDialog.role.viewer",
    "shareDialog.role.editor",
    "shareDialog.viewerOnly.chat",
    "shareDialog.viewerOnly.workspace",
    "shareDialog.viewerOnly.publishedApplet",
    "shareDialog.searchPeoplePlaceholder",
    "shareDialog.noMatches",
    "shareDialog.noRecipients",
    "shareDialog.unknownUser",
    "shareDialog.remove",
    "shareDialog.saving",
];

const LOCALE_KEYS = [...PORTAL_KEYS, ...SHARE_DIALOG_KEYS];

describe("portal and sharing locale labels", () => {
    it.each(LOCALE_KEYS)("defines %s in en.json", (key) => {
        expect(en[key]).toBeTruthy();
    });

    it.each(LOCALE_KEYS)("defines %s in ar.json", (key) => {
        expect(ar[key]).toBeTruthy();
    });

    it.each(LOCALE_KEYS)("defines %s in default en.json", (key) => {
        expect(defaultEn[key]).toBeTruthy();
    });

    it.each(LOCALE_KEYS)("defines %s in default ar.json", (key) => {
        expect(defaultAr[key]).toBeTruthy();
    });
});
