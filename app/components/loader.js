import { Loader2 } from "lucide-react";
import classNames from "../utils/class-names";

export default function Loader({ size = "default", className = "" }) {
    let heightClass = "h-5";
    let widthClass = "w-5";

    if (size === "small") {
        heightClass = "h-3";
        widthClass = "w-3";
    }

    return (
        <Loader2
            className={classNames(
                `ms-1 inline-block ${heightClass} ${widthClass} animate-spin`,
                className || "text-sky-500",
            )}
            role="status"
        >
            <span className="!absolute !-m-px !h-px !w-px !overflow-hidden !whitespace-nowrap !border-0 !p-0 ![clip:rect(0,0,0,0)]">
                Loading...
            </span>
        </Loader2>
    );
}
