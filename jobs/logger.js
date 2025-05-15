import dayjs from "dayjs";
const logTimestamp = () => dayjs().format("YYYY-MM-DD HH:mm:ss:SSS");

class Logger {
    constructor({ id, name } = {}) {
        this.id = id;
        this.name = name;
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
    }
}

export { Logger };
