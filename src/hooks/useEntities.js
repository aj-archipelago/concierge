import { useQuery } from "@apollo/client";
import { SYS_GET_ENTITIES } from "../graphql";

export function useEntities(userAiName) {
    const { data: entitiesData } = useQuery(SYS_GET_ENTITIES);
    const entities = entitiesData?.sys_get_entities?.result
        ? JSON.parse(entitiesData.sys_get_entities.result)
        : [];

    // Find and update the default entity's name
    const aliasedEntities = entities.map((entity) => {
        if (entity.isDefault) {
            return { ...entity, name: userAiName || "Labeeb" };
        }
        return entity;
    });

    // Find default entity ID
    const defaultEntity = aliasedEntities.find((e) => e.isDefault);
    const defaultEntityId = defaultEntity?.id || "";

    return {
        entities: aliasedEntities,
        defaultEntityId
    };
} 