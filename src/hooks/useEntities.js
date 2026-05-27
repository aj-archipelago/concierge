import { useQuery } from "@apollo/client";
import { useMemo, useRef } from "react";
import { SYS_GET_ENTITIES } from "../graphql";

export function useEntities(userAiName, { userId, personalEntityId } = {}) {
    const { data: entitiesData, error } = useQuery(SYS_GET_ENTITIES, {
        variables: { userId },
        skip: !userId,
        fetchPolicy: "cache-and-network",
    });

    const rawResult = entitiesData?.sys_get_entities?.result;

    const prevRawRef = useRef(rawResult);
    if (rawResult !== prevRawRef.current) {
        if (rawResult === undefined || rawResult !== prevRawRef.current) {
            prevRawRef.current = rawResult;
        }
    }
    const stableRawResult = prevRawRef.current;

    return useMemo(() => {
        const defaultResponse = {
            entities: [
                {
                    id: "default",
                    name: userAiName || "Concierge",
                    isDefault: true,
                },
            ],
            defaultEntityId: "default",
            entitiesLoaded: false,
        };

        if (error || !stableRawResult) {
            return defaultResponse;
        }

        let entities;
        try {
            entities = JSON.parse(stableRawResult);
        } catch (parseError) {
            console.error("Failed to parse entities:", parseError);
            return defaultResponse;
        }

        const personalEntityExists =
            personalEntityId && entities.some((e) => e.id === personalEntityId);

        const aliasedEntities = entities
            .filter(
                (entity) =>
                    !(
                        personalEntityExists &&
                        entity.isDefault &&
                        entity.id !== personalEntityId
                    ),
            )
            .map((entity) => {
                if (personalEntityExists && entity.id === personalEntityId) {
                    return {
                        ...entity,
                        name: userAiName || entity.name,
                        isDefault: true,
                    };
                }
                if (!personalEntityExists && entity.isDefault) {
                    return { ...entity, name: userAiName || "Concierge" };
                }
                return entity;
            });

        const defaultEntity = aliasedEntities.find((e) => e.isDefault);
        const defaultEntityId = defaultEntity?.id || "default";

        return {
            entities: aliasedEntities,
            defaultEntityId,
            entitiesLoaded: Boolean(stableRawResult),
        };
    }, [stableRawResult, error, userAiName, personalEntityId]);
}
