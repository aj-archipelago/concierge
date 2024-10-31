import { useState, useEffect, useRef } from "react";
import { useApolloClient, useSubscription } from "@apollo/client";
import { Progress } from "@/components/ui/progress";
import ProgressTimer from "react-progress-timer";
import ReactTimeAgo from "react-time-ago";
import { SUBSCRIPTIONS, CODE_HUMAN_INPUT } from "../../graphql";
import { MdCancel } from "react-icons/md";

const ProgressUpdate = ({
    requestId,
    setFinalData,
    initialText = "Processing...",
    codeAgent = false,
}) => {
    const { data } = useSubscription(SUBSCRIPTIONS.REQUEST_PROGRESS, {
        variables: { requestIds: [requestId] },
    });

    const apolloClient = useApolloClient();
    const [cancelButtonDisabled, setCancelButtonDisabled] = useState(false);

    const [info, setInfo] = useState(null);
    const [showInfo, setShowInfo] = useState(true);

    const [progress, setProgress] = useState(10);
    const [completionTime, setCompletionTime] = useState(null);
    const progressRef = useRef(progress);
    progressRef.current = progress;

    useEffect(() => {
        setProgress(10);
        setCompletionTime(null);
    }, [requestId]);

    useEffect(() => {
        const result = data?.requestProgress?.data;
        const completionTime = data?.requestProgress?.completionTime;
        const newProgress = Math.max(
            (data?.requestProgress?.progress || 0) * 100,
            progress,
        );

        const curInfo = data?.requestProgress?.info;

        if (result) {
            let finalData = result;
            try {
                finalData = JSON.parse(result);
            } catch (e) {
                // ignore json parse error
            }
            setFinalData(finalData);
        }

        setProgress(newProgress);
        setCompletionTime(completionTime);
        curInfo && setInfo(curInfo);
    }, [data, progress, setFinalData, info]);

    if (data?.requestProgress?.data) {
        return null;
    }

    const handleCancel = () => {
        setCancelButtonDisabled(true);

        apolloClient.query({
            query: CODE_HUMAN_INPUT,
            variables: {
                codeRequestId: requestId,
                text: "TERMINATE",
            },
            fetchPolicy: "network-only",
        });
    };

    return (
        <>
            <div className="mb-2">
                <div className="flex items-center">
                    <Progress value={progress} />

                    {codeAgent && (
                        <button
                            disabled={cancelButtonDisabled}
                            className={`px-2 py-1 m-0 ml-2 rounded flex justify-center items-center text-xs ${
                                cancelButtonDisabled
                                    ? " animate-pulse bg-red-600"
                                    : "bg-red-500 hover:bg-red-600"
                            }`}
                            onClick={handleCancel}
                        >
                            <MdCancel />
                        </button>
                    )}
                </div>
            </div>
            <div className="mb-1">
                <ProgressTimer
                    initialText={initialText}
                    percentage={progress}
                    calculateByAverage={true}
                    rollingWindowAverageSize={3}
                    decreaseTime={false}
                />
            </div>
            <div className="flex flex-col">
                {completionTime && (
                    <div>
                        Completing in <ReactTimeAgo date={completionTime} />
                    </div>
                )}
                {info && (
                    <div
                        className={`max-w-full text-xs font-mono rounded-md bg-neutral-200 overflow-hidden transition-all duration-300 ease-in-out ${
                            showInfo
                                ? "mb-1 max-h-[10em] overflow-auto opacity-100 p-2 "
                                : "max-h-0 opacity-0"
                        }`}
                    >
                        <pre
                            className="overflow-auto break-words break-all whitespace-pre-wrap"
                            style={{
                                display: "-webkit-box",
                                WebkitLineClamp: "5",
                                WebkitBoxOrient: "vertical",
                            }}
                        >
                            {info.replace(/\s+/g, " ")}
                        </pre>
                    </div>
                )}
                {info && (
                    <div className="w-64">
                        <button
                            className="text-xs text-sky-500 hover:text-sky-700"
                            onClick={() => setShowInfo(!showInfo)}
                        >
                            {showInfo
                                ? "hide info"
                                : "show info (click to expand)"}
                        </button>
                    </div>
                )}
            </div>
        </>
    );
};

export default ProgressUpdate;
