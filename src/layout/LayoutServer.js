import { cookies } from "next/headers";
import Layout from "./Layout";

export default async function LayoutServer({ children }) {
    const cookieStore = await cookies();
    const chatBoxPosition = cookieStore.get("chatboxPosition");

    return <Layout chatBoxPosition={chatBoxPosition}>{children}</Layout>;
}
