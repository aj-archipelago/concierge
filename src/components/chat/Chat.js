import { useTranslation } from "react-i18next";
import { useDispatch } from "react-redux";
import { clearChat } from "../../stores/chatSlice";
import ChatContent from "./ChatContent";

function Chat() {
    const dispatch = useDispatch();
    const { t } = useTranslation();

    return (
        <div
            style={{
                display: "flex",
                overflow: "auto",
                gap: 10,
                flexDirection: "column",
                alignItems: "center",
            }}
        >
            <div
                style={{
                    display: "flex",
                    width: "100%",
                    justifyContent: "end",
                }}
            >
                <button
                    className="lb-primary lb-sm"
                    size="sm"
                    onClick={() => dispatch(clearChat())}
                >
                    {t("Start over")}
                </button>
            </div>
            <div style={{ flex: 1, width: "100%" }}>
                <ChatContent />
            </div>
        </div>
    );
}

export default Chat;
