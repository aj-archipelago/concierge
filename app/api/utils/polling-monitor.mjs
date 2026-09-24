export class PollingMonitor {
    startMonitoring(interval = 10000) {
        if (this.timer || this.stopped) return;
        const tick = () => {
            if (this.pending || this.stopped) return;
            this.pending = Promise.resolve()
                .then(() => this.check())
                .catch((error) =>
                    console.error("Queue monitoring failed:", error),
                )
                .finally(() => {
                    this.pending = null;
                });
        };
        this.timer = setInterval(tick, interval);
        tick();
    }

    async close() {
        this.stopped = true;
        clearInterval(this.timer);
        await this.pending;
    }
}
