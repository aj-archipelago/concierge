import { useTranslation } from "react-i18next";

const SuggestionInput = ({ value, onChange, inputTitle = "Input", direction }) => {
    const { t } = useTranslation();

    return (
        <div className="flex flex-col h-full">
            <h5 className={`mb-2 font-bold`}>{t(inputTitle)}</h5>
            <div className="h-full">
                <textarea
                    className={`w-full h-full px-1 py-1 focus:ring-offset-2 focus:ring-sky-400 border border-gray-300 font-serif resize-none placeholder-gray-400`}
                    value={value}
                    readOnly
                    dir={direction}
                />
            </div>
        </div>
    );
};

export default SuggestionInput;
