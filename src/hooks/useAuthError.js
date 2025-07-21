import { useAuth } from "../components/AuthProvider";

export const useAuthError = () => {
    const { authError, refreshAuth, clearAuthError } = useAuth();

    const handleAuthError = (error) => {
        // Check if the error is authentication-related
        if (
            error?.response?.status === 401 ||
            error?.message?.toLowerCase().includes("unauthorized") ||
            error?.message?.toLowerCase().includes("authentication") ||
            error?.message?.toLowerCase().includes("auth")
        ) {
            refreshAuth();
            return true; // Error was handled
        }
        return false; // Error was not handled
    };

    return {
        authError,
        refreshAuth,
        clearAuthError,
        handleAuthError,
    };
};
