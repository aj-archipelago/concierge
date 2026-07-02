import {
    createContext,
    useCallback,
    useContext,
    useMemo,
    useState,
} from "react";

const NotificationContext = createContext();

export function NotificationProvider({ children }) {
    const [isNotificationOpen, setIsNotificationOpen] = useState(false);

    const openNotifications = useCallback(
        () => setIsNotificationOpen(true),
        [],
    );
    const closeNotifications = useCallback(
        () => setIsNotificationOpen(false),
        [],
    );
    const value = useMemo(
        () => ({
            isNotificationOpen,
            openNotifications,
            closeNotifications,
            setIsNotificationOpen,
        }),
        [closeNotifications, isNotificationOpen, openNotifications],
    );

    return (
        <NotificationContext.Provider value={value}>
            {children}
        </NotificationContext.Provider>
    );
}

export const useNotificationsContext = () => {
    const context = useContext(NotificationContext);
    if (!context) {
        throw new Error("useTasks must be used within a NotificationProvider");
    }
    return context;
};
