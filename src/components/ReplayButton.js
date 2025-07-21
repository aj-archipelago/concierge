import { useTranslation } from "react-i18next";
import { RotateCcw } from "lucide-react";
import classNames from "../../app/utils/class-names";

function ReplayButton({ onClick, className = "absolute top-1 end-1" }) {
    const { t } = useTranslation();

    return (
        <button
            className={classNames(className, "replay-button text-gray-500")}
            onClick={onClick}
            title={t("Replay from this message")}
        >
            <RotateCcw />
        </button>
    );
}

export default ReplayButton;
