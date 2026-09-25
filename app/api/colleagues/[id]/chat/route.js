import { getCurrentUser } from "../../../utils/auth";
import { requireColleague } from "../../../utils/colleagues.js";
import { getColleagueChat } from "../../../utils/colleague-chat.js";
export async function POST(request, { params }) {
    try {
        const user = await getCurrentUser();
        if (!user)
            return Response.json({ error: "Unauthorized" }, { status: 401 });
        const { id } = await params;
        const colleague = await requireColleague(user, id);
        const chat = await getColleagueChat(user, id, colleague.name);
        return Response.json({ chatId: String(chat._id) });
    } catch (error) {
        return Response.json(
            { error: error.message },
            { status: error.status || 503 },
        );
    }
}
