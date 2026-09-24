import { useCallback, useEffect, useRef, useState } from "react";

function resolveSelection(entityId, entities, defaultEntityId, entitiesLoaded) {
    if (
        entityId &&
        (entityId.startsWith("colleague-") ||
            !entitiesLoaded ||
            entities.some((entity) => entity.id === entityId))
    ) {
        return entityId;
    }
    return defaultEntityId || "";
}

export function useChatEntitySelection({
    chat,
    entities,
    defaultEntityId,
    entitiesLoaded,
    readOnly,
    updateChat,
}) {
    const chatId = chat?._id ? String(chat._id) : null;
    const persistedEntityId = chat?.selectedEntityId || "";
    const [selection, setSelection] = useState(null);
    const repairRef = useRef(null);
    const localSelection =
        selection?.chatId === chatId &&
        selection?.persistedEntityId === persistedEntityId;
    const selectedEntityId =
        localSelection && selection.entityId
            ? selection.entityId
            : resolveSelection(
                  persistedEntityId,
                  entities,
                  defaultEntityId,
                  entitiesLoaded,
              );
    const setSelectedEntityId = useCallback(
        (entityId) => setSelection({ chatId, persistedEntityId, entityId }),
        [chatId, persistedEntityId],
    );

    useEffect(() => {
        // An unavailable colleague is still the intended target. Let the server
        // reject it; never rewrite its chat to the personal assistant.
        if (
            !chatId ||
            !persistedEntityId ||
            !entitiesLoaded ||
            readOnly ||
            chat?.readOnly ||
            localSelection ||
            !selectedEntityId ||
            selectedEntityId === persistedEntityId
        ) {
            repairRef.current = null;
            return;
        }
        const repairKey = `${chatId}:${persistedEntityId}->${selectedEntityId}`;
        if (repairRef.current === repairKey) return;
        repairRef.current = repairKey;
        updateChat({ chatId, selectedEntityId });
    }, [
        chatId,
        persistedEntityId,
        entitiesLoaded,
        readOnly,
        chat?.readOnly,
        localSelection,
        selectedEntityId,
        updateChat,
    ]);

    return { selectedEntityId, setSelectedEntityId };
}
