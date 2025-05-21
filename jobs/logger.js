const dayjs = require("dayjs");
const { Job, Queue } = require("bullmq");
const { getRedisConnection } = require("../app/api/utils/redis.mjs");
const logTimestamp = () => dayjs().format("YYYY-MM-DD HH:mm:ss:SSS");

class Logger {
    constructor({ id, name, queueName } = {}) {
        this.id = id;
        this.name = name;
        if (queueName) {
            const connection = getRedisConnection();
            this.queue = new Queue(queueName, { connection });
        }
    }

    log(message, ...debug) {
        let debugInfo = "";
        let prefix = "";

        if (this.id && this.name) {
            prefix = `(${this.id}-${this.name})`;
        }

        if (debug?.length > 0) {
            debugInfo = debug.filter(Boolean).join("-");
        }

        if (debugInfo) {
            message = `${message} [${debugInfo}] `;
        }

        const elements = [`${logTimestamp()}${prefix}`, message];
        console.log(elements.filter(Boolean).join(": "));

        if (this.queue) {
            Job.addJobLog(
                this.queue,
                this.id,
                `${logTimestamp()}${prefix}: ${message} ${debugInfo ? `[${debugInfo}]` : ""}`,
            );
        }
    }
}

module.exports = {
    Logger,
};
