"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import { isAzureAppService } from "../utils/auth";

export const SignOutButton = ({ className = "" }) => {
    const [isLoading, setIsLoading] = useState(false);

    const handleSignOut = async () => {
        setIsLoading(true);

        try {
            if (isAzureAppService()) {
                // For Azure App Service, redirect to the proper logout endpoint
                window.location.href = "/.auth/logout";
            } else {
                // For local development, use local auth system
                const response = await fetch("/api/auth/local?action=logout", {
                    method: "GET",
                    credentials: "include",
                });

                if (response.ok) {
                    // Force a complete page reload to clear all cached state
                    window.location.replace("/auth/login");
                } else {
                    console.error("Sign out failed");
                }
            }
        } catch (error) {
            console.error("Sign out error:", error);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Button
            onClick={handleSignOut}
            disabled={isLoading}
            variant="outline"
            size="sm"
            className={className}
        >
            <LogOut className="h-4 w-4 mr-2" />
            {isLoading ? "Signing out..." : "Sign out"}
        </Button>
    );
};
