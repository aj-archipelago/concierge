"use client";

import * as React from "react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

const Checkbox = React.forwardRef(({ className, ...props }, ref) => (
    <CheckboxPrimitive.Root
        ref={ref}
        className={cn(
            "peer h-4 w-4 shrink-0 rounded-sm border border-sky-200 border-sky-900 ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-sky-600 data-[state=checked]:text-sky-50 dark:border-sky-800 dark:border-sky-50 dark:ring-offset-sky-950 dark:focus-visible:ring-sky-300 dark:data-[state=checked]:bg-sky-50 dark:data-[state=checked]:text-sky-900",
            className,
        )}
        {...props}
    >
        <CheckboxPrimitive.Indicator
            className={cn("flex items-center justify-center text-current")}
        >
            <Check className="h-4 w-4" />
        </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
));
Checkbox.displayName = CheckboxPrimitive.Root.displayName;

export { Checkbox };
