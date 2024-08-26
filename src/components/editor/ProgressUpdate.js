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

        if (result) {
            setFinalData(JSON.parse(result));
        }

        setProgress(newProgress);
        setCompletionTime(completionTime);
    }, [data, progress, setFinalData]);

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
            {completionTime && (
                <div>
                    Completing in <ReactTimeAgo date={completionTime} />
                </div>
            )}
        </>
    );
};

export default ProgressUpdate;
