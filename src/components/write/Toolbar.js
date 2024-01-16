import { Button, OverlayTrigger } from "react-bootstrap";
import { useRef } from "react";
import { Tooltip } from "react-bootstrap";
import { useTranslation } from "react-i18next";
import { LanguageContext } from "../../contexts/LanguageProvider";
import { useContext } from "react";

function Toolbar({
    actions,
    isTextPresent,
    isTextSelected,
    onAction,
    inputText,
}) {
    const ref = useRef(null);
    const targetRef = useRef(null);
    const { t } = useTranslation();
    const { language } = useContext(LanguageContext);

    return (
        <div className="toolbar-container" ref={ref}>
            <div className="toolbar-button-group">
                {Object.keys(actions)
                    .filter(
                        (k) =>
                            ![
                                "remove_content",
                                "summarize",
                                "entities",
                                "tags",
                                "topics",
                                "keywords",
                                "headline",
                            ].includes(k),
                    )
                    .sort((a, b) =>
                        actions[a].title.localeCompare(actions[b].title),
                    )
                    .map((key) => {
                        const action = actions[key];
                        const { Icon, type } = action;

                        let buttonEnabled =
                            type === "always-available" ||
                            (isTextPresent &&
                                (type !== "selection" || isTextSelected));

                        return (
                            <div key={`toolbar-button-${key}`}>
                                <OverlayTrigger
                                    trigger={["hover", "focus"]}
                                    placement={
                                        language.includes("ar")
                                            ? "left"
                                            : "right"
                                    }
                                    overlay={(props) => (
                                        <Tooltip
                                            id={`toolbar-tooltip-${key}`}
                                            {...props}
                                        >
                                            {t(actions[key].title)}
                                        </Tooltip>
                                    )}
                                >
                                    <div>
                                        <Button
                                            ref={targetRef}
                                            className="toolbar-button"
                                            variant="link"
                                            size="sm"
                                            style={{ textAlign: "start" }}
                                            disabled={!buttonEnabled}
                                            onClick={() => onAction(key)}
                                        >
                                            <Icon />
                                        </Button>
                                    </div>
                                </OverlayTrigger>
                            </div>
                        );
                    })}
            </div>
        </div>
    );
}

export default Toolbar;
