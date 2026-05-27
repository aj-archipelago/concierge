const EMAIL_CLAIM_TYPES = [
    "preferred_username",
    "email",
    "emails",
    "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress",
    "upn",
];
const TENANT_CLAIM_TYPES = [
    "http://schemas.microsoft.com/identity/claims/tenantid",
    "tid",
];

const getHeader = (headerList, name) => {
    if (!headerList?.get) {
        return null;
    }

    return headerList.get(name) || headerList.get(name.toLowerCase());
};

const getEmailParts = (value) => {
    if (typeof value !== "string") {
        return null;
    }

    const email = value.trim();
    const parts = email.split("@");

    if (
        parts.length !== 2 ||
        !parts[0] ||
        !parts[1] ||
        /\s/.test(email) ||
        !parts[1].includes(".")
    ) {
        return null;
    }

    return {
        email,
        domain: parts[1].toLowerCase(),
    };
};

const hasEmailDomain = (value) => Boolean(getEmailParts(value));

const decodeBase64Json = (value) => {
    if (!value) {
        return null;
    }

    try {
        const normalizedValue = value
            .replace(/-/g, "+")
            .replace(/_/g, "/")
            .padEnd(Math.ceil(value.length / 4) * 4, "=");
        let decoded = null;

        if (typeof atob === "function") {
            const binary = atob(normalizedValue);
            if (typeof TextDecoder === "function") {
                const bytes = Uint8Array.from(binary, (char) =>
                    char.charCodeAt(0),
                );
                decoded = new TextDecoder().decode(bytes);
            } else {
                decoded = binary;
            }
        } else if (typeof Buffer?.from === "function") {
            decoded = Buffer.from(normalizedValue, "base64").toString("utf8");
        }

        return decoded ? JSON.parse(decoded) : null;
    } catch {
        return null;
    }
};

const getClaimValue = (claims, claimType) => {
    const claim = claims?.find?.(
        ({ typ }) => typ?.toLowerCase() === claimType.toLowerCase(),
    );
    const value = claim?.val;

    if (Array.isArray(value)) {
        return value.find(hasEmailDomain) || null;
    }

    return typeof value === "string" ? value : null;
};

const getStringClaimValue = (claims, claimType) => {
    const claim = claims?.find?.(
        ({ typ }) => typ?.toLowerCase() === claimType.toLowerCase(),
    );
    const value = claim?.val;

    if (Array.isArray(value)) {
        return value.find((item) => typeof item === "string") || null;
    }

    return typeof value === "string" ? value : null;
};

const getPrincipalClaims = (headerList) => {
    const principal = decodeBase64Json(
        getHeader(headerList, "X-MS-CLIENT-PRINCIPAL"),
    );

    return principal?.claims || principal?.user_claims || [];
};

export const parseAuthorizedValues = (authorizedValues) =>
    authorizedValues
        ? authorizedValues
              .split(",")
              .map((value) => value.trim().toLowerCase())
              .filter(Boolean)
        : [];

export const parseAuthorizedTenantIds = parseAuthorizedValues;

export const resolveEntraPrincipalEmail = (headerList) => {
    const principalName = getHeader(headerList, "X-MS-CLIENT-PRINCIPAL-NAME");

    if (hasEmailDomain(principalName)) {
        return getEmailParts(principalName).email;
    }

    const claims = getPrincipalClaims(headerList);

    for (const claimType of EMAIL_CLAIM_TYPES) {
        const claimValue = getClaimValue(claims, claimType);
        if (hasEmailDomain(claimValue)) {
            return getEmailParts(claimValue).email;
        }
    }

    return principalName || null;
};

export const resolveEntraTenantId = (headerList) => {
    const claims = getPrincipalClaims(headerList);

    for (const claimType of TENANT_CLAIM_TYPES) {
        const claimValue = getStringClaimValue(claims, claimType);
        if (claimValue) {
            return claimValue.toLowerCase();
        }
    }

    return null;
};

export const isTenantAuthorized = (tenantId, allowedTenantIds) =>
    Boolean(tenantId && allowedTenantIds.includes(tenantId.toLowerCase()));

export const getEntraPrincipalLogContext = (
    headerList,
    resolvedEmail = null,
) => {
    const email = resolvedEmail || resolveEntraPrincipalEmail(headerList);

    return {
        principalId: getHeader(headerList, "X-MS-CLIENT-PRINCIPAL-ID") || null,
        principalName:
            getHeader(headerList, "X-MS-CLIENT-PRINCIPAL-NAME") || null,
        resolvedEmail: email || null,
        tenantId: resolveEntraTenantId(headerList),
        hasClientPrincipal: Boolean(
            getHeader(headerList, "X-MS-CLIENT-PRINCIPAL"),
        ),
    };
};
