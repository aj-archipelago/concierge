"use client";

import i18next from "i18next";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import config from "../../config";
import { Modal } from "@/components/ui/modal";

const Tos = ({ showTos, setShowTos }) => {
    const { getLogo, getTosContent } = config.global;
    const { language } = i18next;
    const { t } = useTranslation();
    const logo = getLogo(language);
    const tosContent = getTosContent(language);

    const handleTosClose = () => {
        setShowTos(false);
        const rightNow = new Date(Date.now());
        localStorage.setItem("cortexWebShowTos", rightNow.toString());
    };

    useEffect(() => {
        const shouldShowTos = checkShowTos();
        setShowTos(shouldShowTos);
    }, [setShowTos]);

    const checkShowTos = () => {
        const acceptDateString =
            typeof localStorage !== "undefined"
                ? localStorage.getItem("cortexWebShowTos")
                : null;

        if (acceptDateString && typeof acceptDateString === "string") {
            const acceptDate = new Date(acceptDateString);
            const thirtyDaysAgo = new Date(
                Date.now() - 30 * 24 * 60 * 60 * 1000,
            );
            if (acceptDate > thirtyDaysAgo) {
                return false;
            } else {
                return true;
            }
        } else {
            return true;
        }
    };

    return (
        <Modal
            dialogClassName="tos"
            show={showTos}
            title={t("Terms of Service")}
        >
            <div overflow="auto">
                <div className="alert-content">
                    <div className="alert-logo">
                        <img src={logo} height="40px" alt="alert logo" />
                    </div>
                    <div className="alert-text">{tosContent}</div>
                </div>
                <div className="flex justify-end mt-4">
                    <button className="lb-primary" onClick={handleTosClose}>
                        {t("I Accept")}
                    </button>
                </div>
            </div>
        </Modal>
    );
};

export default Tos;
