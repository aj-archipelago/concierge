/**
 * Utility functions for handling Tiptap HTML widgets in HTML content
 * Widgets are in the format: <div html="...">...</div>
 */

/**
 * Serializes a parse5 node tree back to HTML string
 * @param {Object} node - parse5 node
 * @returns {string} - HTML string
 */
function serializeParse5Node(node) {
    if (node.nodeName === "#text") {
        return node.value || "";
    }
    if (node.nodeName === "#document-fragment") {
        return (node.childNodes || []).map(serializeParse5Node).join("");
    }

    let html = `<${node.nodeName}`;

    // Add attributes
    if (node.attrs) {
        for (const attr of node.attrs) {
            const value = attr.value || "";
            // Escape quotes in attribute values
            const escapedValue = value.replace(/"/g, "&quot;");
            html += ` ${attr.name}="${escapedValue}"`;
        }
    }

    html += ">";

    // Add child nodes
    if (node.childNodes) {
        html += node.childNodes.map(serializeParse5Node).join("");
    }

    html += `</${node.nodeName}>`;
    return html;
}

/**
 * Extracts widgets from HTML and replaces them with placeholder divs
 * Uses DOMParser in browser and parse5 in Node.js for robust HTML parsing
 * @param {string} html - The HTML content containing widgets
 * @returns {Object} - { html: string with placeholders, widgets: Map of widget-id to original widget HTML }
 */
export function extractWidgets(html) {
    if (!html || typeof html !== "string") {
        return { html: html || "", widgets: new Map() };
    }

    const widgets = new Map();
    let widgetIndex = 1;

    // Use DOMParser in browser, parse5 in Node.js
    if (typeof window !== "undefined" && typeof DOMParser !== "undefined") {
        // Browser environment - use DOMParser
        try {
            const parser = new DOMParser();
            // Wrap in a container to handle fragments
            const doc = parser.parseFromString(
                `<div id="widget-container">${html}</div>`,
                "text/html",
            );
            const container = doc.getElementById("widget-container");

            if (!container) {
                // Fallback to original HTML if parsing fails
                return { html, widgets: new Map() };
            }

            // Find all divs with html attribute and process them
            const widgetDivs = Array.from(
                container.querySelectorAll("div[html]"),
            );

            // Store original HTML and replace with placeholders
            widgetDivs.forEach((div) => {
                const originalHTML = div.outerHTML;
                const widgetId = `widget-${widgetIndex}`;
                widgets.set(widgetId, originalHTML);
                widgetIndex++;

                // Replace the div with a placeholder
                const placeholder = doc.createElement("div");
                placeholder.id = widgetId;
                placeholder.textContent = widgetId;
                div.parentNode.replaceChild(placeholder, div);
            });

            // Extract the inner HTML of the container (without the wrapper)
            const htmlWithPlaceholders = container.innerHTML;

            return {
                html: htmlWithPlaceholders,
                widgets: widgets,
            };
        } catch (error) {
            console.warn("Error parsing HTML with DOMParser:", error);
            // Fallback to original HTML
            return { html, widgets: new Map() };
        }
    } else {
        // Server environment - use parse5
        try {
            // Dynamic import for parse5 to avoid issues in browser bundles
            const parse5 = require("parse5");
            const document = parse5.parseFragment(html);

            // Find all div elements with html attribute
            const findWidgetDivs = (node, parent = null, index = -1) => {
                const results = [];
                if (
                    node.nodeName === "div" &&
                    node.attrs?.some((attr) => attr.name === "html")
                ) {
                    results.push({ node, parent, index });
                }
                if (node.childNodes) {
                    node.childNodes.forEach((child, idx) => {
                        results.push(...findWidgetDivs(child, node, idx));
                    });
                }
                return results;
            };

            const widgetDivs = findWidgetDivs(document);

            // Process widgets and store their original HTML
            // We need to serialize before modifying to preserve original structure
            widgetDivs.forEach(({ node }) => {
                const originalHTML = serializeParse5Node(node);
                const widgetId = `widget-${widgetIndex}`;
                widgets.set(widgetId, originalHTML);
                widgetIndex++;

                // Replace the node with a placeholder div
                const placeholder = {
                    nodeName: "div",
                    tagName: "div",
                    attrs: [{ name: "id", value: widgetId }],
                    childNodes: [
                        {
                            nodeName: "#text",
                            value: widgetId,
                        },
                    ],
                };

                // Find the parent in the document tree and replace the node
                const findParent = (currentNode, targetNode) => {
                    if (currentNode.childNodes) {
                        if (currentNode.childNodes.includes(targetNode)) {
                            return currentNode;
                        }
                        for (const child of currentNode.childNodes) {
                            const found = findParent(child, targetNode);
                            if (found) return found;
                        }
                    }
                    return null;
                };

                const parent = findParent(document, node);
                if (parent && parent.childNodes) {
                    const index = parent.childNodes.indexOf(node);
                    if (index !== -1) {
                        parent.childNodes[index] = placeholder;
                    }
                }
            });

            // Serialize the modified document back to HTML
            const htmlWithPlaceholders = serializeParse5Node(document);

            return {
                html: htmlWithPlaceholders,
                widgets: widgets,
            };
        } catch (error) {
            console.warn("Error parsing HTML with parse5:", error);
            // Fallback to original HTML
            return { html, widgets: new Map() };
        }
    }
}

/**
 * Restores widgets from placeholders in HTML
 * @param {string} html - The HTML content with placeholder divs
 * @param {Map} widgets - Map of widget-id to original widget HTML
 * @returns {string} - HTML with widgets restored
 */
export function restoreWidgets(html, widgets) {
    if (!html || typeof html !== "string" || !widgets || widgets.size === 0) {
        return html || "";
    }

    let restoredHtml = html;

    // Replace each placeholder with its original widget
    widgets.forEach((originalWidget, widgetId) => {
        const placeholderRegex = new RegExp(
            `<div\\s+id=["']${widgetId}["'][^>]*>${widgetId}<\\/div>`,
            "gi",
        );
        restoredHtml = restoredHtml.replace(placeholderRegex, originalWidget);
    });

    return restoredHtml;
}
