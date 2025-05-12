import { createContext, useContext, useState } from "react";

const NotificationContext = createContext();

export function NotificationProvider({ children }) {
    const [isNotificationOpen, setIsNotificationOpen] = useState(false);

    const openNotifications = () => setIsNotificationOpen(true);
    const closeNotifications = () => setIsNotificationOpen(false);

    return (
        <NotificationContext.Provider
            value={{
                isNotificationOpen,
                openNotifications,
                closeNotifications,
                setIsNotificationOpen,
            }}
        >
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
