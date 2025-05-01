import React from "react";

// Accept an optional size prop (defaults to 'small' if not provided)
const EntityIcon = ({
    letter,
    bgColorClass,
    textColorClass,
    size = "small",
}) => {
    // Determine classes based on size
    // Small: Fixed size w-5 h-5
    // Large: Fixed size w-12 h-12 (like original logo container) WITHOUT p-2 padding
    const sizeClasses =
        size === "large"
            ? "w-8 h-8 text-xl mt-2 mx-auto" //
            : "w-5 h-5 text-lg"; // Default fixed size for top bar

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
