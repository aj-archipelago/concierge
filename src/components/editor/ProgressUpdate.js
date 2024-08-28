import { useState, useEffect, useRef } from "react";
import { useSubscription } from "@apollo/client";
import { Progress } from "@/components/ui/progress";
import ProgressTimer from "react-progress-timer";
import ReactTimeAgo from "react-time-ago";
import { SUBSCRIPTIONS } from "../../graphql";

const ProgressUpdate = ({
    requestId,
    setFinalData,
    initialText = "Processing...",
}) => {
    const { data } = useSubscription(SUBSCRIPTIONS.REQUEST_PROGRESS, {
        variables: { requestIds: [requestId] },
    });

    const [info, setInfo] = useState(null);
    const [showInfo, setShowInfo] = useState(false);

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

    return (
        <>
            <div className="mb-2">
                <Progress value={progress} />
            </div>
            <ProgressTimer
                initialText={initialText}
                percentage={progress}
                calculateByAverage={true}
                rollingWindowAverageSize={3}
                decreaseTime={false}
            />
        <div className="relative flex justify-center items-center">
            {completionTime && (
                <div>
                    Completing in <ReactTimeAgo date={completionTime} />
                </div>
            )}
            {info && (
                <div className="absolute right-0 flex items-center text-[10px] top-[-15px]">
                    <input
                        type="checkbox"
                        id="showInfo"
                        checked={showInfo}
                        onChange={(e) => setShowInfo(e.target.checked)}
                        className="mr-2 focus:ring-0 focus:ring-offset-0 focus:outline-none"
                    />
                    <label htmlFor="showInfo" className="text-xs">Show agent info</label>
                </div>
            )}
        </div>
        {showInfo && info && (
            <div className="max-w-full m-1 text-[10px]">
                <span
                    className="overflow-hidden break-words whitespace-pre-wrap"
                    style={{
                        display: "-webkit-box",
                        WebkitLineClamp: "5",
                        WebkitBoxOrient: "vertical",
                    }}
                >
                    {info.replace(/\s+/g, ' ')}
                </span>
            </div>
        )}
        </>
    );
};

export default ProgressUpdate;
