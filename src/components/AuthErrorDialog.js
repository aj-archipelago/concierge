"use client";

import React from "react";
import { useAuth } from "./AuthProvider";
import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogDescription,
    AlertDialogFooter,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { RefreshCw, AlertCircle } from "lucide-react";

export const AuthErrorDialog = () => {
    const { authError, isAuthenticating, refreshAuth, clearAuthError } =
        useAuth();

    if (!authError) {
        return null;
    }

    return (
        <AlertDialog
            open={!!authError}
            onOpenChange={(open) => !open && clearAuthError()}
        >
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2">
                        <AlertCircle className="h-5 w-5 text-orange-500" />
                        Authentication Required
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                        Your session has expired. You need to sign in again to
                        continue using the application.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <Button
                        variant="outline"
                        onClick={clearAuthError}
                        disabled={isAuthenticating}
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={refreshAuth}
                        disabled={isAuthenticating}
                        className="flex items-center gap-2"
                    >
                        {isAuthenticating ? (
                            <>
                                <RefreshCw className="h-4 w-4 animate-spin" />
                                Signing In...
                            </>
                        ) : (
                            <>
                                <RefreshCw className="h-4 w-4" />
                                Sign In Again
                            </>
                        )}
                    </Button>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
};
