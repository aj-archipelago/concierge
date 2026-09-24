import { useQuery } from "@apollo/client";
import { useMemo } from "react";
import { SYS_GET_ENTITIES } from "../graphql";

export function useEntities(
    userAiName,
    { userId, personalEntityId, selectedEntityId, query = "" } = {},
) {
    const {
        data: entitiesData,
        error,
        loading,
    } = useQuery(SYS_GET_ENTITIES, {
        variables: {
            userId,
            entityId: selectedEntityId || personalEntityId || undefined,
            fresh: "true",
            query,
        },
        skip: !userId,
        fetchPolicy: "cache-and-network",
        notifyOnNetworkStatusChange: true,
    });
    const { data: personalData, loading: personalLoading } = useQuery(
        SYS_GET_ENTITIES,
        {
            variables: { userId, entityId: personalEntityId, fresh: "true" },
            skip:
                !userId ||
                !personalEntityId ||
                !selectedEntityId ||
                selectedEntityId === personalEntityId,
            fetchPolicy: "cache-and-network",
        },
    );
    const personalResult = personalData?.sys_get_entities?.result;
    const stableRawResult = entitiesData?.sys_get_entities?.result;

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
            const additional = JSON.parse(personalResult || "[]");
            if (!Array.isArray(entities) || !Array.isArray(additional))
                return defaultResponse;
            entities = [
                ...new Map(
                    [...entities, ...additional].map((entity) => [
                        entity.id,
                        entity,
                    ]),
                ).values(),
            ];
            if (!Array.isArray(entities)) return defaultResponse;
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
            entitiesLoaded:
                Boolean(stableRawResult) && !loading && !personalLoading,
        };
    }, [
        stableRawResult,
        personalResult,
        error,
        loading,
        personalLoading,
        userAiName,
        personalEntityId,
    ]);
}
