"use client";

import { useTranslation } from "react-i18next";
import { useDispatch } from "react-redux";
import { clearChat } from "../../stores/codeSlice";
import CodeChatContent from "./CodeChatContent";

function Code() {
    const messageCount = 5;
    const dispatch = useDispatch();
    const { t } = useTranslation();

    return (
        <div className="flex flex-col gap-3 h-full">
            <div className="flex justify-end">
                <button
                    className="lb-primary lb-sm"
                    size="sm"
                    onClick={() => {
                        if (window.confirm(t("Are you sure?"))) {
                            dispatch(clearChat());
                        }
                    }}
                >
                    {t("Start over")}
                </button>
            </div>
            <div className="grow overflow-auto">
                <CodeChatContent contextMessageCount={messageCount} />
            </div>
        </div>
    );
}

export default Code;
