import { cookies } from "next/headers";
import Layout from "./Layout";

export default function LayoutServer({ children }) {
    const cookieStore = cookies();
    const chatBoxPosition = cookieStore.get("chatboxPosition");

    return <Layout chatBoxPosition={chatBoxPosition}>{children}</Layout>;
}
