"use client";

import Loader from "../../components/loader";

export default function ChatLoading() {
    return (
        <div className="flex items-center justify-center h-full">
            <Loader />
        </div>
    );
}
