"use client";

import { useParams } from "next/navigation";
import ArticleSharedRoutePage from "../../../src/components/articles/ArticleSharedRoutePage";

export default function Page() {
    const { id } = useParams();
    return <ArticleSharedRoutePage articleId={id} />;
}
