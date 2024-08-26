import { useTranslation } from "react-i18next";
import CopyButton from "../CopyButton";

const ComparisonView = ({ outputText, onOutputChange }) => {
    const { t } = useTranslation();

    return (
        <div className="flex flex-col h-full w-full">
            <h5 className="mb-2 font-bold">{t("Revision")}</h5>
            <div className="relative flex-grow">
                <CopyButton
                    item={outputText}
                    className="absolute top-1 end-4 z-10"
                />
                <textarea
                    className="w-full h-full px-1 py-1 focus:ring-offset-2 focus:ring-sky-400 border border-gray-300 font-serif resize-none placeholder-gray-400"
                    value={outputText}
                    onChange={(e) => onOutputChange(e.target.value)}
                />
            </div>
        </div>
    );
};

export default ComparisonView;
