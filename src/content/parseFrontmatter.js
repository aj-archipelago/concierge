/**
 * Parse YAML frontmatter from a markdown string.
 * Returns { metadata: {key: value}, content: string }.
 */
export default function parseFrontmatter(raw) {
    const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!match) return { metadata: {}, content: raw };
    const metadata = {};
    match[1].split("\n").forEach((line) => {
        const colonIndex = line.indexOf(":");
        if (colonIndex === -1) return;
        const key = line.slice(0, colonIndex).trim();
        let value = line.slice(colonIndex + 1).trim();
        if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
        ) {
            value = value.slice(1, -1);
        }
        if (key) metadata[key] = value;
    });
    return { metadata, content: match[2].trim() };
}
