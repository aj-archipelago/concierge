"use client";

import { t } from "i18next";
import Link from "next/link";
import CodeBlock from "../code/CodeBlock";
import React from "react";
import TextWithCitations from "./TextWithCitations";
import FileUploadComponent from "./FileUploadComponent";
import Markdown from "react-markdown";
import directive from "remark-directive";
import remarkGfm from "remark-gfm";
import { visit } from "unist-util-visit";

function transformToCitation(content) {
    return content.replace(/\[doc(\d+)\]/g, ":cd_source[$1]").replace(/\[upload\]/g, ":cd_upload");
}

function customMarkdownDirective() {
    return (tree) => {
        visit(
            tree,
            ["textDirective", "leafDirective", "containerDirective"],
            (node) => {
                if (node.name === 'cd_source' || node.name === 'cd_upload' || node.name === 'cd_servicelink') {
                    node.data = {
                        hName: node.name,
                        hProperties: node.attributes,
                        ...node.data
                    };
                } else {
                    node.data = {
                        hName: 'cd_default',
                        hProperties: { name: node.name, ...node.attributes },
                        ...node.data
                    };
                }
                return node;
            }
        );
    };
}
  
function highlightCode(input, citations = null) {

    let index = 0;

    if (typeof input !== "string") {
        return input;
    }

    const components = {
        ol(props) {
            const {node, ...rest} = props
            return <ol style={{listStyleType: 'decimal', marginBottom: '1rem', paddingLeft: '1rem'}} {...rest} />
        },
        ul(props) {
            const {node, ...rest} = props
            return <ul style={{listStyleType: 'disc', marginBottom: '1rem', paddingLeft: '1rem'}} {...rest} />
        },
        p(props) {
            const {node, ...rest} = props
            return <div style={{marginTop: '0.5rem', marginBottom: '0.5rem'}} {...rest} />
        },
        cd_source({node, inline, className, children, ...props}) {
            if (children) {
                const index = parseInt(children);
                if (Array.isArray(citations) && citations[index - 1]) {
                    return (
                        <TextWithCitations
                            index={index}
                            citation={citations[index - 1]}
                            {...props}
                        />
                    )
                }
                return null;
            }
            return null;
        },
        cd_upload(props) {
            return <FileUploadComponent {...props} />;
        },
        cd_servicelink({node, children, ...props}) {
            //console.log("serviceLink children", children);
            const serviceName = children;
            const tServiceName = t(serviceName + " interface");
            const tServiceAction = t("Click here for my");

            return <div className="service-link">
                    <Link href={`/${serviceName}`}>{ tServiceAction }&nbsp;{ tServiceName }</Link>.
                    </div>
        },
        cd_default({ children, name, ...props }) {
            return <span>{name}</span>
        },
        code({node, inline, className, children, ...props}) {
            const match = /language-(\w+)/.exec(className || '')
            const language = match ? match[1] : null
            return !inline && match ? (
                <CodeBlock key={`codeblock-${++index}`} code={children} language={language} {...props}/>
            ) : (
              <code className={className} {...props}>
                {children}
              </code>
            )
          }
    }

    //console.log("highlightCode input", input);
    return <Markdown className="chat-message"
            remarkPlugins={[directive, customMarkdownDirective, remarkGfm]}
            components={components} children={transformToCitation(input)}/>;
}

export { highlightCode };
