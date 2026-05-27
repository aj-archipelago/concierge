import Feedback from "../../api/models/feedback";
import FeedbackAdminClient from "./FeedbackAdminClient";

export default async function FeedbackPage({ searchParams }) {
    const status = searchParams.status || "open";
    const selected = searchParams.selected || null;
    const query = ["open", "resolved"].includes(status) ? { status } : {};

    const [feedback, counts, selectedFeedback] = await Promise.all([
        Feedback.find(query)
            .populate("user", "name username")
            .populate("resolvedBy", "name username")
            .sort({ createdAt: -1 })
            .limit(50)
            .lean(),
        Feedback.aggregate([
            {
                $group: {
                    _id: "$status",
                    count: { $sum: 1 },
                },
            },
        ]),
        selected
            ? Feedback.findById(selected)
                  .populate("user", "name username")
                  .populate("resolvedBy", "name username")
                  .lean()
            : null,
    ]);
    const selectedMatchesFilter =
        selectedFeedback &&
        (!["open", "resolved"].includes(status) ||
            selectedFeedback.status === status);

    return (
        <FeedbackAdminClient
            initialFeedback={JSON.parse(JSON.stringify(feedback))}
            initialCounts={counts.reduce(
                (acc, row) => ({
                    ...acc,
                    [row._id]: row.count,
                }),
                { open: 0, resolved: 0 },
            )}
            initialStatus={status}
            initialSelected={
                selectedMatchesFilter
                    ? JSON.parse(JSON.stringify(selectedFeedback))
                    : null
            }
        />
    );
}
