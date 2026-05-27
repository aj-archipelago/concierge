"use client";

import { useContext } from "react";
import { useTranslation } from "react-i18next";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import UnifiedFileManager from "@/src/components/common/UnifiedFileManager";
import { AuthContext } from "../../App";

/**
 * FileCollectionPickerModal — opens UnifiedFileManager in a dialog for selecting
 * existing files to attach to a chat message. Defaults navigation to the
 * current chat's folder so the most relevant files appear first.
 *
 * @param {Object} props
 * @param {boolean} props.isOpen
 * @param {Function} props.onClose
 * @param {string|null} props.chatId
 * @param {Function} props.onAttach - called with selected file objects
 */
export default function FileCollectionPickerModal({
    isOpen,
    onClose,
    chatId = null,
    onAttach,
}) {
    const { t } = useTranslation();
    const { user } = useContext(AuthContext);
    const contextId = user?.contextId || null;

    const handleAttach = (selectedObjects) => {
        onAttach(selectedObjects);
        onClose();
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-5xl w-[90vw] p-0 overflow-hidden">
                <DialogHeader className="px-4 pt-4">
                    <DialogTitle>
                        {t("Attach from file collection")}
                    </DialogTitle>
                </DialogHeader>
                <div className="p-4">
                    <UnifiedFileManager
                        contextId={contextId}
                        chatId={chatId}
                        onAttach={handleAttach}
                        attachLabel={t("Attach")}
                        containerHeight="65vh"
                    />
                </div>
            </DialogContent>
        </Dialog>
    );
}
