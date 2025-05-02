import React from "react";

// Accept an optional size prop (defaults to 'small' if not provided)
const EntityIcon = ({ entity, size = "sm" }) => {
    // Get the first letter of the entity name
    const letter = entity?.name ? entity.name[0].toUpperCase() : "?";

    // Default colors if not provided
    const bgColorClass = entity?.bgColorClass || "bg-blue-500";
    const textColorClass = entity?.textColorClass || "text-white";

    // Size classes mapping
    const sizeClasses =
        {
            lg: "w-8 h-8 text-xl mt-2 mx-auto",
            sm: "w-5 h-5 text-lg",
            xs: "w-4 h-4 text-sm",
        }[size] || "w-5 h-5 text-lg"; // Default to sm classes if invalid size

    return (
        // Remove w-full h-full, apply sizeClasses directly
        <div
            className={`flex items-center justify-center font-bold ${sizeClasses} ${bgColorClass} rounded-full ${textColorClass}`}
        >
            {letter}
        </div>
    );
};

export default EntityIcon;
