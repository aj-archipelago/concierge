export const DEFAULT_APPLET_GENERATION_MODEL = "cortex-default-coding";
export const DEFAULT_APPLET_REASONING_EFFORT = "medium";

export function isPreferredAppletModel(model) {
    return /(?:gpt[-_]?5\.?5|gpt55|opus)/i.test(model || "");
}

export function resolvePreferredAppletModel(defaultModel) {
    if (isPreferredAppletModel(defaultModel)) {
        return defaultModel;
    }

    return DEFAULT_APPLET_GENERATION_MODEL;
}
