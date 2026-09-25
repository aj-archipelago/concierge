const PLACEHOLDER_ENTITY_IDS = new Set(["default"]);

function parseEntitiesResult(rawResult) {
    if (Array.isArray(rawResult)) {
        return rawResult;
    }

    if (typeof rawResult !== "string" || rawResult.trim().length === 0) {
        return [];
    }

    try {
        const parsed = JSON.parse(rawResult);
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        console.warn("[SSE Stream] Failed to parse entities result:", error);
        return [];
    }
}

function normalizeEntityId(entityId) {
    if (typeof entityId !== "string") {
        return "";
    }
    const trimmed = entityId.trim();
    if (!trimmed || PLACEHOLDER_ENTITY_IDS.has(trimmed)) {
        return "";
    }
    return trimmed;
}

/**
 * Prefer the user's personal entity over the shared system default.
 * The shared default intentionally has no WorkspaceSSH, so applet/article
 * draft edits fail when a chat is still bound to it.
 */
function preferPersonalOverSystemDefault({
    entityId,
    personalEntityId,
    systemDefaultEntityId,
}) {
    const normalized = normalizeEntityId(entityId);
    if (
        personalEntityId &&
        systemDefaultEntityId &&
        normalized === systemDefaultEntityId
    ) {
        return personalEntityId;
    }
    return normalized;
}

/**
 * Resolve which Cortex entity a chat stream should use.
 * Upgrades shared-default selections to the user's personal entity when available.
 */
export async function resolveChatEntitySelection({
    graphqlClient,
    currentUser,
    requestedEntityId,
    persistedEntityId,
    getEntitiesQuery,
}) {
    const personalEntityId = normalizeEntityId(currentUser?.personalEntityId);
    const originalPersisted = normalizeEntityId(persistedEntityId);

    let entities = [];
    if (currentUser?.contextId && getEntitiesQuery) {
        try {
            const entitiesResult = await graphqlClient.query({
                query: getEntitiesQuery,
                variables: {
                    userId: currentUser.contextId,
                    fresh: "true",
                    entityId:
                        normalizeEntityId(requestedEntityId) ||
                        originalPersisted ||
                        personalEntityId ||
                        undefined,
                },
                fetchPolicy: "network-only",
            });
            entities = parseEntitiesResult(
                entitiesResult?.data?.sys_get_entities?.result,
            );
        } catch (error) {
            console.warn(
                "[SSE Stream] Failed to fetch entities for stream request:",
                error,
            );
        }
    }

    const validEntityIds = new Set(
        entities.map((entity) => entity?.id).filter(Boolean),
    );
    const systemDefaultEntityId =
        entities.find((entity) => entity?.isDefault)?.id || "";

    const requested = preferPersonalOverSystemDefault({
        entityId: requestedEntityId,
        personalEntityId,
        systemDefaultEntityId,
    });
    const persisted = preferPersonalOverSystemDefault({
        entityId: persistedEntityId,
        personalEntityId,
        systemDefaultEntityId,
    });

    const candidateEntityId = requested || persisted || personalEntityId || "";

    if (!candidateEntityId) {
        return {
            entityId: "",
            persistedEntityId: "",
            repaired: Boolean(originalPersisted),
        };
    }

    // If entity listing failed, keep the best candidate we already have.
    // Cortex also redirects shared-default entityIds to the personal entity
    // when user context is present, so WorkspaceSSH remains available.
    if (validEntityIds.size === 0) {
        const fallbackEntityId = candidateEntityId || personalEntityId || "";
        return {
            entityId: fallbackEntityId,
            persistedEntityId: fallbackEntityId,
            repaired: fallbackEntityId !== originalPersisted,
        };
    }

    const defaultEntityId =
        (personalEntityId && validEntityIds.has(personalEntityId)
            ? personalEntityId
            : null) ||
        personalEntityId ||
        systemDefaultEntityId ||
        "";

    // Colleague IDs are durable targets. Preserve them on an unavailable listing
    // so Cortex can reject a missing/foreign colleague instead of chatting as
    // the personal assistant. Legacy stale-entity repair is unchanged.
    if (
        candidateEntityId.startsWith("colleague-") &&
        !validEntityIds.has(candidateEntityId)
    ) {
        return {
            entityId: candidateEntityId,
            persistedEntityId: candidateEntityId,
            repaired: candidateEntityId !== originalPersisted,
        };
    }

    let finalEntityId = candidateEntityId;
    if (validEntityIds.has(candidateEntityId)) {
        const upgraded = preferPersonalOverSystemDefault({
            entityId: candidateEntityId,
            personalEntityId,
            systemDefaultEntityId,
        });
        finalEntityId =
            upgraded && validEntityIds.has(upgraded)
                ? upgraded
                : candidateEntityId;
    } else {
        finalEntityId = defaultEntityId || candidateEntityId;
        if (candidateEntityId && finalEntityId !== candidateEntityId) {
            console.warn(
                `[SSE Stream] Repairing stale entityId ${candidateEntityId} to ${finalEntityId || "(empty)"}`,
            );
        }
    }

    return {
        entityId: finalEntityId,
        persistedEntityId: finalEntityId,
        repaired: finalEntityId !== originalPersisted,
    };
}

export {
    normalizeEntityId,
    parseEntitiesResult,
    preferPersonalOverSystemDefault,
};
