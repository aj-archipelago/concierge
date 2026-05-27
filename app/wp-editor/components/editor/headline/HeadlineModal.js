import CoreHeadlineModal from "../../../../../src/components/editor/headline/HeadlineModal";

function HeadlineModal({ text, onSelect, args }) {
    return (
        <CoreHeadlineModal
            text={text}
            onSelect={onSelect}
            args={args}
        />
    );
}

export default HeadlineModal;
