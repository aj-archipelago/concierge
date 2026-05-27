import stringcase from "stringcase";

/**
 * Labels and short descriptions for the "available tools" popover only.
 * Tool objects passed to the model are unchanged (English descriptions from
 * clientSideTools, chatTools, getLoadSkillTool, etc.).
 */
export function getToolUiName(tool, t) {
    const raw = tool?.function?.name || tool?.name;
    if (!raw) {
        return t("Unknown", { defaultValue: "Unknown" });
    }
    const key = `tool_display_${raw}_name`;
    return t(key, { defaultValue: stringcase.titlecase(raw) });
}

export function getToolUiDescription(tool, t) {
    const raw = tool?.function?.name || tool?.name;
    const canonical = tool?.function?.description || tool?.description || "";
    if (!raw) return canonical;
    const key = `tool_display_${raw}_desc`;
    return t(key, { defaultValue: canonical });
}
