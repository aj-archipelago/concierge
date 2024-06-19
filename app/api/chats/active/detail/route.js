import { NextResponse } from "next/server";
import { handleError } from "../../../utils/auth";
import { getActiveChatsOfCurrentUser } from "../../_lib";

export async function GET(req) {
    try {
        const userChatInfo = await getActiveChatsOfCurrentUser();
        // console.log("userChatInfo", userChatInfo.map(chat => String(chat._id)));
        return NextResponse.json(userChatInfo);
    } catch (error) {
        return handleError(error);
    }
}
