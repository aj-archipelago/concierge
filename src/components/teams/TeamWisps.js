"use client";
import ColleagueAvatar, {
    getEntityWispVariant,
} from "../colleagues/ColleagueAvatar";
import { memberActivity, isTeamActive } from "../../utils/assistantTeamStatus";
import styles from "./TeamWisps.module.css";

export default function TeamWisps({ team, colleagues = [], paused = false }) {
    const coordinator = team.members.find(
        (m) => m.assistantId === team.coordinatorId,
    );
    const members = [
        coordinator,
        ...team.members.filter((m) => m !== coordinator).slice(0, 4),
    ].filter(Boolean);
    return (
        <span className={styles.cluster} aria-hidden="true">
            {members.map((member, index) => {
                const state = memberActivity(team, member).state;
                const moving =
                    !paused &&
                    isTeamActive(team) &&
                    ["working", "reviewing", "coordinating"].includes(state);
                const entity = colleagues.find(
                    (c) => (c.id || c._id) === member.assistantId,
                );
                return (
                    <span
                        key={member.assistantId}
                        data-team-wisp-state={state}
                        className={`${index ? styles.satellite : styles.center} ${moving ? styles.moving : ""}`}
                        style={{ "--delay": `${index * -0.7}s` }}
                    >
                        <ColleagueAvatar
                            entityId={member.assistantId}
                            variant={getEntityWispVariant(entity)}
                            animated={false}
                            className={index ? "h-7 w-6" : "h-11 w-9"}
                        />
                    </span>
                );
            })}
        </span>
    );
}
