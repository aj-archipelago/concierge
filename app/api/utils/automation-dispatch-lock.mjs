import { randomUUID } from "node:crypto";
import Automation from "../models/automation.js";
export const AUTOMATION_CLAIM_MS = 10 * 60 * 1000;
export async function claimAutomationDispatch(
    id,
    extra = {},
    { timestamps = true } = {},
) {
    const now = new Date();
    const claimed = await Automation.findOneAndUpdate(
        {
            _id: id,
            ...extra,
            $or: [
                { schedulerLockedAt: null },
                {
                    schedulerLockedAt: {
                        $lt: new Date(now - AUTOMATION_CLAIM_MS),
                    },
                },
            ],
        },
        { $set: { schedulerLockedAt: now, schedulerLockToken: randomUUID() } },
        { new: true, timestamps },
    );
    return claimed;
}
export async function releaseAutomationDispatch(
    claimed,
    fields = {},
    { timestamps = true } = {},
) {
    return Automation.findOneAndUpdate(
        {
            _id: claimed._id,
            schedulerLockToken: claimed.schedulerLockToken,
            nextRunAt: claimed.nextRunAt,
        },
        {
            $set: fields,
            $unset: { schedulerLockedAt: 1, schedulerLockToken: 1 },
        },
        { new: true, timestamps },
    );
}
