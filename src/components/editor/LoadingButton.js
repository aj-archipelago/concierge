import React from 'react';
import Loader from "../../../app/components/loader";
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
    const buttonClasses = classNames(
        "flex gap-2 items-center justify-center",
        "text-sm font-medium px-4", // Added consistent text styling
        "transition-colors duration-200", // Added smooth transition for hover effects
        "rounded-md", // Added rounded corners
        className,
        { "opacity-75 cursor-not-allowed": disabled || loading } // Added disabled state styling
    );

    const renderContent = () => {
        if (loading) {
            return (
                <>
                    <Loader size="small" className="text-current" />
                    {text && <span>{text}</span>}
                </>
            );
        }
        return children;
    };

    return (
        <button
            className={buttonClasses}
            type={type}
            style={style}
            onClick={onClick}
            disabled={disabled || loading}
        >
            {renderContent()}
        </button>
    );
};

export default LoadingButton;