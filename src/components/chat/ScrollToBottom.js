import React, { useEffect, useRef } from "react";

const ScrollToBottom = ({ children, loadComplete }) => {
    const containerRef = useRef(null);

    useEffect(() => {
        // Scrolls to the bottom of the chat container
        const scroll = () => {
            const scrollHeight = containerRef.current.scrollHeight;
            const height = containerRef.current.clientHeight;
            const maxScrollTop = scrollHeight - height;
            containerRef.current.scrollTop =
                maxScrollTop > 0 ? maxScrollTop : 0;
        };

        scroll();
        // Dependency array ensures effect runs when 'children' changes or when loading is complete
    }, [children, loadComplete]);

    return (
        <div ref={containerRef} style={{ overflowY: "auto", height: "100%" }}>
            {children}
        </div>
    );
};

export default ScrollToBottom;
