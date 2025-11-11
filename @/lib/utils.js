import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { isValidElementType } from "react-is";

export function cn(...inputs) {
    return twMerge(clsx(inputs));
}

/**
 * Filters out duplicate Lucide icons by removing aliases and non-icon exports
 * @param {Object} icons - The Icons object from lucide-react
 * @returns {string[]} Array of unique valid icon component names
 */
export function getUniqueLucideIcons(icons) {
    const iconNames = Object.keys(icons);
    const uniqueIcons = new Set();
    const seenIcons = new Map(); // Map to track which icons are aliases

    // Known non-icon exports to exclude
    const nonIconExports = new Set(["createLucideIcon", "icons"]);

    // Helper to check if an export is a valid React component
    const isValidIconComponent = (iconName, iconValue) => {
        // Skip non-icon exports
        if (nonIconExports.has(iconName)) return false;

        // Use React's official API to validate component types
        // This handles function components, forwardRef components, memo components, etc.
        return isValidElementType(iconValue);
    };

    // First pass: identify the primary names (without common alias suffixes)
    iconNames.forEach((iconName) => {
        const iconValue = icons[iconName];

        // Skip if not a valid icon component
        if (!isValidIconComponent(iconName, iconValue)) {
            return;
        }

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
