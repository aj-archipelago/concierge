import React, { useRef, useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import classNames from "../../../app/utils/class-names";

const LoadingButton = ({
    loading = false,
    disabled = false,
    onClick,
    style,
    children,
    className = "lb-primary",
    type = "button",
    text = "",
}) => {
    // Create a ref to measure the text width
    const textRef = useRef(null);
    const [buttonWidth, setButtonWidth] = useState("auto");
    // Measure the text width and set button width
    useEffect(() => {
        if (textRef.current) {
            const width = textRef.current.offsetWidth;
            setButtonWidth(`${width + 32}px`); // Add padding
        }
    }, [children]);

    const buttonClasses = classNames(
        "flex gap-2 items-center justify-center",
        "text-sm font-medium px-4",
        "min-h-[40px]", // Minimum height to prevent vertical size changes while staying responsive
        "transition-colors duration-200",
        "rounded-md",
        className,
        { "opacity-75 cursor-not-allowed": disabled },
    );

    const renderContent = () => {
        return (
            <>
                {/* Hidden text for width measurement */}
                <span
                    ref={textRef}
                    className="absolute opacity-0 pointer-events-none"
                >
                    {children}
                </span>
                {/* Visible content */}
                {loading ? (
                    <Loader2 className="animate-spin h-4 w-4" />
                ) : (
                    children
                )}
            </>
        );
    };

    return (
        <button
            className={buttonClasses}
            type={type}
            style={{ ...style, width: buttonWidth }}
            onClick={onClick}
            disabled={disabled}
        >
            {renderContent()}
        </button>
    );
};

export default LoadingButton;
