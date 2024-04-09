"use client";

import { useTranslation } from "react-i18next";
import { useDispatch } from "react-redux";
import { clearChat } from "../../stores/chatSlice";
import ChatContent from "./ChatContent";
import dynamic from "next/dynamic";

const ChatTopMenuDynamic = dynamic(() => import('./ChatTopMenu'))


function Chat() {
    const dispatch = useDispatch();
    const { t } = useTranslation();

    return (
        <div className="flex flex-col gap-3 h-full">
            <div className="flex justify-between">
                <ChatTopMenuDynamic />
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
                <ChatContent />
            </div>
        </div>
    );
}

export default Chat;
