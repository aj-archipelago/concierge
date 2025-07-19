"use client";
import { useContext, useEffect, useState } from "react";
import { Tag } from "lucide-react";
import config from "../../../../config";
import { LanguageContext } from "../../../contexts/LanguageProvider";
import { QUERIES } from "../../../graphql";
import CopyButton from "../../CopyButton";
import SidebarItem from "./SidebarItem";

export default function Topics({ inputText }) {
    const [topics, setTopics] = useState([]);
    const { language } = useContext(LanguageContext);

    const [potentialTopics, setPotentialTopics] = useState([]);

    useEffect(() => {
        setTimeout(() => {
            config?.data?.getTopics(language).then((topics) => {
                setPotentialTopics(topics || []);
            });
        }, 1);
    }, [potentialTopics, language]);

    return (
        <SidebarItem
            icon={<Tag />}
            inputText={inputText}
            name="Topics"
            output={topics}
            renderOutput={() => (
                <div className="mb-2">
                    {topics.map((item, i) => (
                        <div
                            key={`topic-${i}`}
                            className="p-2 border-b last:border-none"
                        >
                            <CopyButton item={item} />
                            {item}
                        </div>
                    ))}
                </div>
            )}
            query={{
                query: QUERIES.TOPICS,
                variables: {
                    text: inputText,
                    topics: potentialTopics?.join(", "),
                },
            }}
            onGenerate={(data) => setTopics(data?.topics?.result)}
        />
    );
}
