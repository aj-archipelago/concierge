import { useState } from "react";
import { Button } from "@/components/ui/button";

const DebugInfo = ({ prompt, temperature }) => {
    const [showDebug, setShowDebug] = useState(false);

    if (localStorage.getItem("ai_debug") !== "true") {
        return null;
    }

    if (!showDebug) {
        return (
            <div className="text-right">
                <Button variant="link" onClick={() => setShowDebug(true)}>
                    Show debug info
                </Button>
            </div>
        );
    }

    return (
        <div>
            <div>
                <strong>Prompt:</strong>
                <pre className="whitespace-pre-wrap break-words font-mono p-2 bg-gray-200">
                    {prompt}
                </pre>
            </div>
            <div>
                <strong>Temperature:</strong> {temperature || "-"}
            </div>
            <div className="text-right">
                <Button variant="link" onClick={() => setShowDebug(false)}>
                    Hide debug info
                </Button>
            </div>
        </div>
    );
};

export default DebugInfo;
