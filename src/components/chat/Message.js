import { t } from "i18next";
import { Trans } from "react-i18next";
import { Link } from "react-router-dom";
import { highlightCode } from "./ChatMessage";
import FileUploadComponent from "./FileUploadComponent";

function addServiceLink(text, serviceName) {
    if (serviceName === "upload") {
        return (
            <>
                {/* {text} */}
                <FileUploadComponent text={text} />
            </>
        );
    }
    return (
        <>
            {text}
            <div className="service-link">
                <Trans
                    i18nKey="serviceLink"
                    values={{ serviceName: t(serviceName + " interface") }}
                >
                    Here is a link to my&nbsp;
                    <Link to={`/${serviceName}`}>{{ serviceName }}</Link>
                    &nbsp;tab.
                </Trans>
            </div>
        </>
    );
}

// This function is there to add complex content to a message.
// It is needed because redux does not allow you to serialize
// complex JS objects to the store. So we store simple hooks in the store
// and then do post-processing to add the complex content while  rendering.
function postProcessMessage(text, data, tool) {
    const citations = JSON.parse(tool || "{}")?.citations;

    let formatted = highlightCode(text, "pre", citations);
    if (data && data.serviceName) {
        formatted = addServiceLink(formatted, data.serviceName);
    }
    return formatted;
}

export { postProcessMessage };
