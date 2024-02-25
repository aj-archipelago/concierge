import { highlightCode } from "./ChatMessage";

// This function is there to add complex content to a message.
// It is needed because redux does not allow you to serialize
// complex JS objects to the store. So we store simple hooks in the store
// and then do post-processing to add the complex content while  rendering.
function postProcessMessage(text, data, tool) {
    //console.log("postProcessMessage", text, data, tool);
    let citations;
    if (tool) {
        citations = JSON.parse(tool).citations;
    }

    return highlightCode(text, citations);
}

export { postProcessMessage };
