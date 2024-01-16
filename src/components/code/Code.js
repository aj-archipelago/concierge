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
        <div>
            <div className="flex justify-end mb-3">
                <button
                    className="lb-primary lb-sm"
                    size="sm"
                    onClick={() => dispatch(clearChat())}
                >
                    {t("Start over")}
                </button>
            </div>
            <div>
                <CodeChatContent contextMessageCount={messageCount} />
            </div>
        </div>
    );
}

export default Code;
