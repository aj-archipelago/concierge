// utils.js

import stringcase from "stringcase"; // Import the stringcase library

// List of queries that should be handled asynchronously
export const asyncQueries = ["GRAMMAR", "STYLE_GUIDE", "TRANSLATE"];

/**
 * Normalizes quotes in a given text.
 * @param {string} text - The input text to normalize.
 * @returns {string} - The text with normalized quotes.
 */
export function normalizeQuotes(text) {
    return text.replace(/"|"|'|'/g, (match) =>
        match === "'" || match === "'" ? "'" : '"',
    );
}

/**
 * Extracts the query name from the data object.
 * @param {Object} data - The data object returned from the API.
 * @param {string} query - The original query string.
 * @returns {string} - The extracted query name.
 */
export function extractQueryName(data, query) {
    return query === "STYLE_GUIDE"
        ? "styleguide"
        : Object.keys(data)[0] || stringcase.camelcase(query);
}

/**
 * Safely parses JSON string.
 * @param {string} jsonString - The JSON string to parse.
 * @returns {Object|null} - The parsed object or null if parsing fails.
 */
export function safeJsonParse(jsonString) {
    try {
        return JSON.parse(jsonString);
    } catch (error) {
        console.error("Error parsing JSON:", error);
        return null;
    }
}

/**
 * Formats error message for display.
 * @param {Object} error - The error object.
 * @returns {string} - Formatted error message.
 */
export function formatErrorMessage(error) {
    return JSON.stringify(error, null, 2);
}

/**
 * Truncates a string to a specified length.
 * @param {string} str - The string to truncate.
 * @param {number} maxLength - The maximum length of the string.
 * @returns {string} - The truncated string.
 */
export function truncateString(str, maxLength) {
    if (str.length <= maxLength) return str;
    return str.slice(0, maxLength - 3) + "...";
}

/**
 * Debounce function to limit the rate at which a function can fire.
 * @param {Function} func - The function to debounce.
 * @param {number} wait - The number of milliseconds to delay.
 * @returns {Function} - The debounced function.
 */
export function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Checks if a value is empty (null, undefined, empty string, or empty array).
 * @param {*} value - The value to check.
 * @returns {boolean} - True if the value is empty, false otherwise.
 */
export function isEmpty(value) {
    return (
        value === null ||
        value === undefined ||
        value === "" ||
        (Array.isArray(value) && value.length === 0)
    );
}

/**
 * Capitalizes the first letter of a string.
 * @param {string} string - The input string.
 * @returns {string} - The string with its first letter capitalized.
 */
export function capitalizeFirstLetter(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
}
