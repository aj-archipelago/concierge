import { NextResponse } from "next/server";
import { handleError } from "../../../utils/auth";
import { getRecentChatsOfCurrentUser } from "../../_lib";

export async function GET(req) {
    try {
        const userChatInfo = await getRecentChatsOfCurrentUser();
        // console.log("userChatInfo", userChatInfo.map(chat => String(chat._id)));
        return NextResponse.json(userChatInfo);
    } catch (error) {
        return handleError(error);
    }
}
