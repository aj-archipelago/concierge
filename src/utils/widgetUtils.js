/**
 * Utility functions for handling Tiptap HTML widgets in HTML content
 * Widgets are in the format: <div html="...">...</div>
 */

import { parseFragment, serialize } from "parse5";

/**
 * Serializes a parse5 node tree back to HTML string
 * @param {Object} node - parse5 node
 * @returns {string} - HTML string
 */
function serializeParse5Node(node) {
    return serialize({ nodeName: "#document-fragment", childNodes: [node] });
}

/**
 * Extracts widgets from HTML and replaces them with placeholder divs
 * Uses parse5 for robust inert HTML parsing across browser and Node.js.
 * @param {string} html - The HTML content containing widgets
 * @returns {Object} - { html: string with placeholders, widgets: Map of widget-id to original widget HTML }
 */
export function extractWidgets(html) {
    if (!html || typeof html !== "string") {
        return { html: html || "", widgets: new Map() };
    }

    const widgets = new Map();
    let widgetIndex = 1;

    try {
        const document = parseFragment(html);

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
                namespaceURI: "http://www.w3.org/1999/xhtml",
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

        return {
            html: serialize(document),
            widgets: widgets,
        };
    } catch (error) {
        console.warn("Error parsing HTML with parse5:", error);
        // Fallback to original HTML
        return { html, widgets: new Map() };
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
