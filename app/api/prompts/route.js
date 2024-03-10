import Prompt from "../models/prompt";
import { getCurrentUser } from "../utils/auth";

export async function GET() {
    const user = await getCurrentUser();
    //read from mongoose Prompt model for the current user
    const prompts = await Prompt.find({ user: user._id }).sort({
        createdAt: -1,
    });
    return Response.json(prompts);
}
