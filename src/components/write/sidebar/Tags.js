"use client";
import { useContext, useEffect, useState } from "react";
import { Tag } from "lucide-react";
import config from "../../../../config";
import { LanguageContext } from "../../../contexts/LanguageProvider";
import { QUERIES } from "../../../graphql";
import CopyButton from "../../CopyButton";
import SidebarItem from "./SidebarItem";

export default function Tags({ inputText }) {
    const [tags, setTags] = useState([]);

    const { language } = useContext(LanguageContext);

    const [potentialTags, setPotentialTags] = useState([]);

    useEffect(() => {
        setTimeout(() => {
            config?.data?.getTags(language).then((tags) => {
                setPotentialTags(tags || []);
            });
        }, 1);
    }, [potentialTags, language]);

    if (!potentialTags) {
        return null;
    }

    return (
        <SidebarItem
            icon={<Tag />}
            inputText={inputText}
            name="Tags"
            output={tags}
            renderOutput={() => (
                <div className="mb-2">
                    {tags.map((item, i) => (
                        <div
                            key={`tag-${i}`}
                            className="p-2 border-b last:border-none"
                        >
                            <CopyButton item={item} />
                            {item}
                        </div>
                    ))}
                </div>
            )}
            query={{
                query: QUERIES.TAGS,
                variables: { text: inputText, tags: potentialTags?.join(", ") },
            }}
            onGenerate={(data) => setTags(data?.tags?.result)}
        />
    );
}
