import User from "../app/api/models/user.mjs";
import { colleagueRequest } from "../app/api/utils/colleagues.js";
import { publishColleagueMessage } from "../app/api/utils/colleague-chat.js";
export async function deliverColleagueMessages() {
    const { messages = [] } = await colleagueRequest("delivery");
    const acknowledgedIds = [];
    let deliveryError = null;
    for (const message of messages) {
        const user = await User.findOne({ contextId: message.owner })
            .select("_id")
            .lean();
        if (!user) continue;
        try {
            await publishColleagueMessage(user, message);
            acknowledgedIds.push(message._id);
        } catch (error) {
            deliveryError = error;
        }
    }
    if (acknowledgedIds.length)
        await colleagueRequest("delivery", {
            acknowledgedIds: JSON.stringify(acknowledgedIds),
        });
    if (deliveryError) throw deliveryError;
}
