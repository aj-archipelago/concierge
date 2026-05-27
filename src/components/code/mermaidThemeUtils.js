const LIGHT_TEXT_COLOR = "#f8fafc";
const DARK_TEXT_COLOR = "#0f172a";
const IMPORTANT_PROPERTIES = new Set(["fill", "color"]);

function normalizeCssValue(value) {
    return String(value)
        .replace(/\s*!important\s*$/i, "")
        .trim();
}

function appendInlineStyles(element, styles) {
    const existing = element.getAttribute("style");
    const serialized = Object.entries(styles)
        .map(([property, value]) => {
            const normalizedValue = normalizeCssValue(value);
            const importantSuffix = IMPORTANT_PROPERTIES.has(property)
                ? " !important"
                : "";

            return `${property}:${normalizedValue}${importantSuffix}`;
        })
        .join(";");

    element.setAttribute(
        "style",
        existing ? `${existing};${serialized}` : serialized,
    );
}

function parseNumericChannel(value) {
    if (value.endsWith("%")) {
        const percentage = Number.parseFloat(value);
        if (Number.isNaN(percentage)) {
            return null;
        }
        return Math.round((percentage / 100) * 255);
    }

    const parsed = Number.parseFloat(value);
    return Number.isNaN(parsed) ? null : parsed;
}

function parseColor(value) {
    if (!value || typeof value !== "string") {
        return null;
    }

    const normalized = normalizeCssValue(value).toLowerCase();
    if (
        !normalized ||
        normalized === "none" ||
        normalized === "transparent" ||
        normalized === "currentcolor" ||
        normalized.startsWith("url(")
    ) {
        return null;
    }

    const hexMatch = normalized.match(
        /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i,
    );
    if (hexMatch) {
        const [, hex] = hexMatch;

        if (hex.length === 3 || hex.length === 4) {
            const r = Number.parseInt(hex[0] + hex[0], 16);
            const g = Number.parseInt(hex[1] + hex[1], 16);
            const b = Number.parseInt(hex[2] + hex[2], 16);
            const a =
                hex.length === 4
                    ? Number.parseInt(hex[3] + hex[3], 16) / 255
                    : 1;

            return a === 0 ? null : { r, g, b };
        }

        const r = Number.parseInt(hex.slice(0, 2), 16);
        const g = Number.parseInt(hex.slice(2, 4), 16);
        const b = Number.parseInt(hex.slice(4, 6), 16);
        const a =
            hex.length === 8 ? Number.parseInt(hex.slice(6, 8), 16) / 255 : 1;

        return a === 0 ? null : { r, g, b };
    }

    const rgbMatch = normalized.match(/^rgba?\(([^)]+)\)$/i);
    if (!rgbMatch) {
        return null;
    }

    const channels = rgbMatch[1]
        .replace(/\//g, ",")
        .split(/[,\s]+/)
        .map((part) => part.trim())
        .filter(Boolean);

    if (channels.length < 3) {
        return null;
    }

    const r = parseNumericChannel(channels[0]);
    const g = parseNumericChannel(channels[1]);
    const b = parseNumericChannel(channels[2]);
    const alpha = channels.length >= 4 ? Number.parseFloat(channels[3]) : 1;

    if ([r, g, b].some((channel) => channel === null) || alpha === 0) {
        return null;
    }

    return { r, g, b };
}

function getStyleValue(style, property) {
    if (!style) {
        return null;
    }

    const match = style.match(new RegExp(`${property}\\s*:\\s*([^;]+)`, "i"));
    return match ? match[1].trim() : null;
}

function getElementFillColor(element) {
    if (!element) {
        return null;
    }

    return (
        parseColor(element.getAttribute("fill")) ||
        parseColor(getStyleValue(element.getAttribute("style"), "fill")) ||
        parseColor(
            getStyleValue(element.getAttribute("style"), "background-color"),
        )
    );
}

function getGroupFillColor(group) {
    if (!group) {
        return null;
    }

    const shapeCandidates = [
        ...group.querySelectorAll("rect, polygon, ellipse, circle"),
        ...group.querySelectorAll("path"),
    ];

    for (const candidate of shapeCandidates) {
        const color = getElementFillColor(candidate);
        if (color) {
            return color;
        }
    }

    return null;
}

function srgbToLinear(channel) {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function getRelativeLuminance({ r, g, b }) {
    return (
        0.2126 * srgbToLinear(r) +
        0.7152 * srgbToLinear(g) +
        0.0722 * srgbToLinear(b)
    );
}

function getContrastingTextColor(fillColor) {
    return getRelativeLuminance(fillColor) > 0.45
        ? DARK_TEXT_COLOR
        : LIGHT_TEXT_COLOR;
}

function applyTextColor(container, color) {
    if (!container) {
        return;
    }

    container.querySelectorAll("text, tspan").forEach((element) => {
        element.setAttribute("fill", color);
        appendInlineStyles(element, {
            fill: color,
            color,
        });
    });

    container
        .querySelectorAll("foreignObject *, .label span, .label p, .label div")
        .forEach((element) => {
            appendInlineStyles(element, {
                fill: color,
                color,
            });
        });
}

function colorizeGroupByFill(group, target = group) {
    const fillColor = getGroupFillColor(group);
    if (!fillColor) {
        return;
    }

    applyTextColor(target, getContrastingTextColor(fillColor));
}

export function normalizeMermaidSvgForDarkTheme(svgContent) {
    if (
        typeof svgContent !== "string" ||
        !svgContent ||
        typeof DOMParser === "undefined" ||
        typeof XMLSerializer === "undefined"
    ) {
        return svgContent;
    }

    try {
        const parser = new DOMParser();
        const document = parser.parseFromString(svgContent, "image/svg+xml");

        if (document.querySelector("parsererror")) {
            return svgContent;
        }

        document
            .querySelectorAll(".node, .rough-node, .edgeLabel")
            .forEach((group) => colorizeGroupByFill(group));

        document.querySelectorAll(".cluster").forEach((group) => {
            colorizeGroupByFill(group);
        });

        document.querySelectorAll(".cluster-label").forEach((group) => {
            applyTextColor(group, LIGHT_TEXT_COLOR);
        });

        return new XMLSerializer().serializeToString(document);
    } catch {
        return svgContent;
    }
}
