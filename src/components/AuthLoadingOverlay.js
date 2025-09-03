"use client";

import React from "react";
import { useAuth } from "./AuthProvider";
import { RefreshCw } from "lucide-react";

export const AuthLoadingOverlay = () => {
    const { isAuthenticating } = useAuth();

    if (!isAuthenticating) {
        return null;
    }

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 flex flex-col items-center gap-4">
                <RefreshCw className="h-8 w-8 animate-spin text-sky-600" />
                <div className="text-center">
                    <h3 className="text-lg font-semibold text-gray-900">
                        Signing In
                    </h3>
                    <p className="text-sm text-gray-600 mt-1">
                        Please wait while we authenticate your session...
                    </p>
                </div>
            </div>
        </div>
    );
};
