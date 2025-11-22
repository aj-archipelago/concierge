import * as React from "react";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

const Spinner = React.forwardRef(
    ({ className, size = "sm", ...props }, ref) => {
        const sizeClasses = {
            sm: "h-4 w-4",
            md: "h-6 w-6",
            lg: "h-8 w-8",
        };

        return (
            <Loader2
                ref={ref}
                className={cn("animate-spin", sizeClasses[size], className)}
                {...props}
            />
        );
    },
);
Spinner.displayName = "Spinner";

export { Spinner };
