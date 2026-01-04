import { useContext } from "react";
import CoreHeadlineModal from "../../../../../src/components/editor/headline/HeadlineModal";
import { DataContext } from "../../../contexts/DataProvider";

function HeadlineModal({ text, onSelect, args }) {
    const { aiModules } = useContext(DataContext);

    function getTargetLength() {
        let targetLength = 120;

        // Use context aiModules or fallback to window.AIModules for backward compatibility
        const modules = aiModules || window?.AIModules;

        if (modules) {
            if (modules.site === "aje") {
                targetLength = 75;
            }

            if (
                ["aja", "ajd", "ajm"].includes(modules.site) &&
                modules.postType === "liveblog-update"
            ) {
                targetLength = 150;
            } else if (
                ["ajb", "ajc", "aje"].includes(modules.site) &&
                modules.postType === "liveblog-update"
            ) {
                targetLength = 120;
            }
        }

        return targetLength;
    }

    const targetLength = getTargetLength();

    return (
        <CoreHeadlineModal
            text={text}
            onSelect={onSelect}
            args={args}
            targetLength={targetLength}
        />
    );
}

export default HeadlineModal;
