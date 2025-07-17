import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs) {
    return twMerge(clsx(inputs));
}

/**
 * Filters out duplicate Lucide icons by removing aliases
 * @param {Object} icons - The Icons object from lucide-react
 * @returns {string[]} Array of unique icon names without aliases
 */
export function getUniqueLucideIcons(icons) {
    const iconNames = Object.keys(icons);
    const uniqueIcons = new Set();
    const seenIcons = new Map(); // Map to track which icons are aliases

    // First pass: identify the primary names (without common alias suffixes)
    iconNames.forEach((iconName) => {
        // Remove common alias suffixes
        const baseName = iconName
            .replace(/Icon$/, "") // Remove "Icon" suffix
            .replace(/^Lucide/, ""); // Remove "Lucide" prefix

        // If we haven't seen this base name before, or if this is the shorter version
        if (
            !seenIcons.has(baseName) ||
            iconName.length < seenIcons.get(baseName).length
        ) {
            // If we already have a longer version, remove it
            if (seenIcons.has(baseName)) {
                uniqueIcons.delete(seenIcons.get(baseName));
            }
            seenIcons.set(baseName, iconName);
            uniqueIcons.add(iconName);
        }
    });

    return Array.from(uniqueIcons).sort();
}
