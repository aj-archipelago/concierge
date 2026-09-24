import { getCurrentUser } from "../../utils/auth";
import { colleagueRequest } from "../../utils/colleagues.js";
export async function POST(request) {
    try {
        const user = await getCurrentUser();
        if (!user)
            return Response.json({ error: "Unauthorized" }, { status: 401 });
        const { purpose, current } = await request.json();
        if (
            typeof purpose !== "string" ||
            !purpose.trim() ||
            purpose.length > 6000 ||
            (current != null &&
                (typeof current !== "string" || current.length > 14000))
        )
            throw new Error("Describe what the assistant should do");
        const result = await colleagueRequest("draft", {
            purpose,
            current: current || "",
        });
        for (const [key, limit] of Object.entries({
            name: 80,
            description: 500,
            instructions: 12000,
        })) {
            if (
                typeof result[key] !== "string" ||
                !result[key].trim() ||
                result[key].length > limit
            )
                throw new Error(
                    "The assistant draft was incomplete; try again",
                );
        }
        return Response.json({
            name: result.name,
            description: result.description,
            instructions: result.instructions,
        });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 400 });
    }
}
