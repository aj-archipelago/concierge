import { useTranslation } from "react-i18next";
import { MdOutlineReplay } from "react-icons/md";
import classNames from "../../app/utils/class-names";

function ReplayButton({ onClick, className = "absolute top-1 end-1" }) {
    const { t } = useTranslation();

    return (
        <button
            className={classNames(className, "replay-button text-gray-500")}
            onClick={onClick}
            title={t("Replay from this message")}
        >
            <MdOutlineReplay />
        </button>
    );
}

export default ReplayButton;
