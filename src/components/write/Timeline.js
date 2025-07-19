import dayjs from "dayjs";
import * as chrono from "chrono-node";
import { useTranslation } from "react-i18next";

const getLastOccurrenceOfMonth = (monthName) => {
    const month = [
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December",
    ].indexOf(monthName);
    const date = new Date();

    while (date.getMonth() !== month) {
        date.setMonth(date.getMonth() - 1);
    }

    return date.toLocaleString("default", { month: "long", year: "numeric" });
};

const normalize = (str) => {
    if (str === "Upcoming") {
        return dayjs().add(1, "month"); // just for sorting purposes
    } else if (str === "Recent") {
        return dayjs();
    } else {
        const yearRegex = /^\d{4}$/;
        const monthRegex =
            /^(January|February|March|April|May|June|July|August|September|October|November|December)$/i;

        if (str.match(yearRegex)) {
            return dayjs(`${str}-01-01`);
        } else if (str.match(monthRegex)) {
            return dayjs(`${getLastOccurrenceOfMonth(str)}`);
        } else {
            return dayjs(str);
        }
    }
};

function Timeline({ timeline }) {
    const { t } = useTranslation();
    if (timeline.length === 0) {
        return <div>{t("No data")}</div>;
    } else {
        const groups = {};

        timeline.forEach((originalEvent) => {
            const event = Object.assign({}, originalEvent);
            let groupKey = event.time;
            const eventMoment = dayjs(event.time).isValid()
                ? dayjs(event.time)
                : null;

            if (eventMoment) {
                const oneMonthAgo = dayjs().subtract(1, "month");
                const isWithinOneMonth = eventMoment.isAfter(oneMonthAgo);
                const isDuringCurrentYear = eventMoment.isSame(dayjs(), "year");
                const isDuringCurrentMonth = eventMoment.isSame(
                    dayjs(),
                    "month",
                );
                const isInFuture = eventMoment.isAfter(dayjs());

                const hasDate =
                    chrono.parseDate(event.time) &&
                    chrono.parse(event.time)[0].start.knownValues.day;
                const hasMonth =
                    chrono.parseDate(event.time) &&
                    chrono.parse(event.time)[0].start.knownValues.month;
                event.displayTime = "";

                if (isInFuture) {
                    groupKey = "Upcoming";

                    if (hasDate) {
                        if (eventMoment.isSame(dayjs().add(1, "day"), "day")) {
                            event.displayTime = t("Tomorrow");
                        } else {
                            event.displayTime = eventMoment.format("MMMM DD");
                        }
                    } else {
                        event.displayTime = "";
                    }
                } else if (isWithinOneMonth) {
                    groupKey = "Recent";

                    if (eventMoment.isSame(dayjs(), "day")) {
                        event.displayTime = t("Today");
                    } else if (
                        eventMoment.isSame(dayjs().subtract(1, "day"), "day")
                    ) {
                        event.displayTime = t("Yesterday");
                    } else {
                        if (hasDate) {
                            event.displayTime = eventMoment.format("MMMM DD");
                        } else {
                            event.displayTime = "";
                        }
                    }
                } else if (isDuringCurrentYear && !isDuringCurrentMonth) {
                    groupKey = eventMoment.format("MMMM");

                    if (hasDate) {
                        event.displayTime = dayjs(event.time).format("MMMM DD");
                    } else if (hasMonth) {
                        event.displayTime = "";
                    }
                } else {
                    groupKey = eventMoment.format("YYYY");

                    if (!hasDate) {
                        if (hasMonth) {
                            event.displayTime = eventMoment.format("MMMM");
                        }
                    } else {
                        event.displayTime = eventMoment.format("MMMM DD");
                    }
                }
            }

            if (!groups[groupKey]) {
                groups[groupKey] = [];
            }

            groups[groupKey].push(event);
        });

        return (
            <div className="timeline">
                {Object.keys(groups)
                    .sort((a, b) => {
                        return normalize(a).isAfter(normalize(b)) ? -1 : 1;
                    })
                    .map((group, i) => (
                        <div key={`group-${i}`} className="mb-3">
                            <div className="timeline-group-title">{group}</div>
                            <table>
                                {groups[group]
                                    .sort((a, b) =>
                                        dayjs(a.sortTime || a.time).isBefore(
                                            dayjs(b.sortTime || b.time),
                                        )
                                            ? 1
                                            : -1,
                                    )
                                    .map((event, j) => (
                                        <tr key={`timeline-${i}-${j}`}>
                                            <td
                                                style={{
                                                    width: 80,
                                                    verticalAlign: "top",
                                                }}
                                            >
                                                {
                                                    <span className="timeline-item-date">
                                                        {event.displayTime}
                                                    </span>
                                                }
                                            </td>
                                            <td>{event.event}</td>
                                        </tr>
                                    ))}
                            </table>
                        </div>
                    ))}
            </div>
        );
    }
}

export default Timeline;
