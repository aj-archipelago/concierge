"use client";
import { useContext, useEffect, useState } from "react";
import { ListGroup } from "react-bootstrap";
import { MdOutlineTopic } from "react-icons/md";
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
            icon={<MdOutlineTopic />}
            inputText={inputText}
            name="Topics"
            output={topics}
            renderOutput={() => (
                <ListGroup className="mb-2">
                    {topics.map((item, i) => (
                        <ListGroup.Item key={`topic-${i}`}>
                            <CopyButton item={item} />
                            {item}
                        </ListGroup.Item>
                    ))}
                </ListGroup>
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
