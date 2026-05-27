/** Persisted summary length matches `Skill` schema `description.maxlength` (`app/api/models/skill.js`). */
export const SKILL_DESCRIPTION_MAX_LENGTH = 500;

export const SKILL_DESCRIPTION_OVERFLOW_HEADER =
    "**Extended skill summary**\n(Saved here because skill descriptions above are limited for when-to-load prompts.)\n\n";

const SKILL_DESCRIPTION_OVERFLOW_SEPARATOR = "\n\n---\n\n";

/**
 * @param {string} description
 * @returns {{ summary: string, overflow: string | null }}
 */
export function splitSkillSummaryDescription(description) {
    const trimmed = String(description ?? "").trim();
    if (trimmed.length <= SKILL_DESCRIPTION_MAX_LENGTH) {
        return { summary: trimmed, overflow: null };
    }
    const summary = trimmed.slice(0, SKILL_DESCRIPTION_MAX_LENGTH);
    const overflow = trimmed.slice(SKILL_DESCRIPTION_MAX_LENGTH).trim();
    return {
        summary,
        overflow: overflow.length ? overflow : null,
    };
}

/**
 * Removes a previously-generated overflow block (header + separator) from the
 * top of a SKILL.md body, if present. Lets repeated saves stay idempotent.
 *
 * @param {string} markdownBody
 * @returns {string}
 */
export function stripSkillDescriptionOverflowBlock(markdownBody) {
    const body = markdownBody ?? "";
    if (!body.startsWith(SKILL_DESCRIPTION_OVERFLOW_HEADER)) return body;
    const separatorIdx = body.indexOf(
        SKILL_DESCRIPTION_OVERFLOW_SEPARATOR,
        SKILL_DESCRIPTION_OVERFLOW_HEADER.length,
    );
    if (separatorIdx === -1) return body;
    return body.slice(
        separatorIdx + SKILL_DESCRIPTION_OVERFLOW_SEPARATOR.length,
    );
}

/**
 * Prepends truncated description remainder to SKILL.md so detail is retained.
 * Strips any previously-generated overflow block first so repeat saves don't
 * accumulate duplicate summary blocks.
 *
 * @param {string|null} overflow
 * @param {string} markdownBody
 * @returns {string}
 */
export function mergeSkillDescriptionOverflowIntoMarkdown(
    overflow,
    markdownBody,
) {
    const cleanedBody = stripSkillDescriptionOverflowBlock(markdownBody);
    if (!overflow) return cleanedBody;

    const prefixed = `${SKILL_DESCRIPTION_OVERFLOW_HEADER}${overflow}${SKILL_DESCRIPTION_OVERFLOW_SEPARATOR}${cleanedBody}`;
    return prefixed.trimEnd();
}
