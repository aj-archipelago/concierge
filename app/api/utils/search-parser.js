/**
 * Parse search query into terms and exact phrases
 * Supports:
 * - Space-separated terms with AND logic: "cat dog" → ["cat", "dog"]
 * - Quoted phrases for exact match: "black cat" dog → ['"black cat"', "dog"]
 *
 * @param {string} query - The search query
 * @returns {Array<string>} Array of terms and quoted phrases
 */
export function parseSearchQuery(query) {
    if (!query || typeof query !== "string") return [];

    const terms = [];
    let current = "";
    let inQuotes = false;
    let quoteChar = null;

    for (let i = 0; i < query.length; i++) {
        const char = query[i];

        // Handle quote characters (both " and ')
        if (
            (char === '"' || char === "'") &&
            (quoteChar === null || quoteChar === char)
        ) {
            if (!inQuotes) {
                // Starting a quoted section
                inQuotes = true;
                quoteChar = char;
                current += char;
            } else {
                // Ending a quoted section
                inQuotes = false;
                current += char;
                terms.push(current.trim());
                current = "";
                quoteChar = null;
            }
        }
        // Handle spaces (only split on spaces outside of quotes)
        else if (char === " " && !inQuotes) {
            if (current.trim()) {
                terms.push(current.trim());
                current = "";
            }
        }
        // Regular character
        else {
            current += char;
        }
    }

    // Add any remaining term
    if (current.trim()) {
        terms.push(current.trim());
    }

    return terms.filter((term) => term.length > 0);
}

/**
 * Check if a term is a quoted phrase
 */
export function isQuotedPhrase(term) {
    return (
        (term.startsWith('"') && term.endsWith('"')) ||
        (term.startsWith("'") && term.endsWith("'"))
    );
}

/**
 * Remove quotes from a term
 */
export function unquote(term) {
    if (isQuotedPhrase(term)) {
        return term.slice(1, -1);
    }
    return term;
}

/**
 * Check if text matches a search term (handles both regular terms and quoted phrases)
 */
export function matchesTerm(text, term) {
    if (!text || !term) return false;

    const lowerText = text.toLowerCase();

    if (isQuotedPhrase(term)) {
        // Exact phrase match
        const phrase = unquote(term).toLowerCase();
        return lowerText.includes(phrase);
    } else {
        // Regular term match
        const lowerTerm = term.toLowerCase();
        return lowerText.includes(lowerTerm);
    }
}

/**
 * Check if text matches all search terms (AND logic)
 */
export function matchesAllTerms(text, terms) {
    if (!terms || terms.length === 0) return true;
    return terms.every((term) => matchesTerm(text, term));
}
