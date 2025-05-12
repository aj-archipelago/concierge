import { useQuery } from "@apollo/client";
import { SYS_GET_ENTITIES } from "../graphql";

export function useEntities(userAiName) {
    const defaultResponse = {
        entities: [
            {
                id: "default",
                name: userAiName || "Labeeb",
                isDefault: true,
            },
        ],
        defaultEntityId: "default",
    };

    const { data: entitiesData, error } = useQuery(SYS_GET_ENTITIES);

    // If there's an error or no data, return a default entity
    if (error || !entitiesData?.sys_get_entities?.result) {
        return defaultResponse;
    }

    let entities;
    try {
        entities = JSON.parse(entitiesData.sys_get_entities.result);
    } catch (parseError) {
        console.error("Failed to parse entities:", parseError);
        return defaultResponse;
    }

    // Find and update the default entity's name
    const aliasedEntities = entities.map((entity) => {
        if (entity.isDefault) {
            return { ...entity, name: userAiName || "Labeeb" };
        }
        return entity;
    });

    // Find default entity ID
    const defaultEntity = aliasedEntities.find((e) => e.isDefault);
    const defaultEntityId = defaultEntity?.id || "default";

    return {
        entities: aliasedEntities,
        defaultEntityId,
    };
}
