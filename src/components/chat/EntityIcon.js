import ColleagueAvatar, {
    getEntityWispVariant,
} from "../colleagues/ColleagueAvatar";
import React from "react";

// Accept an optional size prop (defaults to 'small' if not provided)
const EntityIcon = ({ entity, size = "sm", activity }) => {
    return (
        <ColleagueAvatar
            variant={getEntityWispVariant(entity)}
            entityId={entity?.id || entity?.name}
            activity={activity}
            className={
                size === "chat"
                    ? "h-11 w-11 sm:h-[50px] sm:w-[50px]"
                    : size === "lg"
                      ? "h-8 w-8"
                      : size === "xs"
                        ? "h-4 w-4"
                        : "h-6 w-6"
            }
        />
    );
};

export default EntityIcon;
