const APPLET_RUNTIME_PATH_PATTERNS = [
    /^\/apps\/private\/[^/]+\/?$/,
    /^\/apps\/[^/]+\/?$/,
    /^\/published\/applets\/[^/]+\/?$/,
    /^\/published\/workspaces\/[^/]+\/applet\/?$/,
];

const TRUE_PARAM_VALUES = new Set(["1", "true", "yes", "on"]);
const FALSE_PARAM_VALUES = new Set(["0", "false", "no", "off"]);

function getSearchParam(searchParams, name) {
    if (!searchParams || typeof searchParams.get !== "function") {
        return null;
    }

    return searchParams.get(name);
}

function normalizeParamValue(value) {
    return typeof value === "string" ? value.trim().toLowerCase() : null;
}

export function isAppletRuntimePath(pathname) {
    if (typeof pathname !== "string") {
        return false;
    }

    return APPLET_RUNTIME_PATH_PATTERNS.some((pattern) =>
        pattern.test(pathname),
    );
}

export function isAppletEmbedMode(searchParams) {
    const embed = normalizeParamValue(getSearchParam(searchParams, "embed"));
    if (TRUE_PARAM_VALUES.has(embed)) {
        return true;
    }

    const chrome = normalizeParamValue(getSearchParam(searchParams, "chrome"));
    return FALSE_PARAM_VALUES.has(chrome);
}

export function shouldRenderAppletWithoutChrome(pathname, searchParams) {
    return isAppletRuntimePath(pathname) && isAppletEmbedMode(searchParams);
}
