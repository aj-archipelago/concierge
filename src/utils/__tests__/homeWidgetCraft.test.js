import {
    HOME_WIDGET_FORM_FACTOR_RULES,
    HOME_WIDGET_IMAGERY_RULES,
    AUTOMATION_HOME_WIDGET_RULES,
} from "../homeWidgetCraft.js";

test("shares the language, theme and real SDK contract with all widget authors", () => {
    expect(HOME_WIDGET_FORM_FACTOR_RULES).toContain("concierge-locale-change");
    expect(HOME_WIDGET_FORM_FACTOR_RULES).toContain(
        "ConciergeSDK.locale.getLanguage()",
    );
    expect(HOME_WIDGET_FORM_FACTOR_RULES).toContain('html[data-theme="dark"]');
    expect(HOME_WIDGET_FORM_FACTOR_RULES).toContain("360px");
    expect(HOME_WIDGET_FORM_FACTOR_RULES).toContain("560px");
    expect(HOME_WIDGET_IMAGERY_RULES).toContain(
        "ConciergeSDK.media.ensureImage",
    );
    expect(AUTOMATION_HOME_WIDGET_RULES).toContain("same facts as html");
});
