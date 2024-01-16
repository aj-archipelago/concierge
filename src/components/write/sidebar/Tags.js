"use client";
import { useContext, useEffect, useState } from "react";
import { ListGroup } from "react-bootstrap";
import { AiOutlineTag } from "react-icons/ai";
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
        config?.data?.getTags(language).then((tags) => {
            setPotentialTags(tags || []);
        });
    }, [potentialTags, language]);

    if (!potentialTags) {
        return null;
    }

    return (
        <SidebarItem
            icon={<AiOutlineTag />}
            inputText={inputText}
            name="Tags"
            output={tags}
            renderOutput={() => (
                <ListGroup className="mb-2">
                    {tags.map((item, i) => (
                        <ListGroup.Item key={`tag-${i}`}>
                            <CopyButton item={item} />
                            {item}
                        </ListGroup.Item>
                    ))}
                </ListGroup>
            )}
            query={{
                query: QUERIES.TAGS,
                variables: { text: inputText, tags: potentialTags?.join(", ") },
            }}
            onGenerate={(data) => setTags(data?.tags?.result)}
        />
    );
}
