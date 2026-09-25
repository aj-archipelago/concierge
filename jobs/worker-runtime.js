/* global AggregateError */
export function workerRuntime({ workers, monitors, connect, disconnect }) {
    let starting;
    let closing;
    let stopping = false;

    return {
        run(onError) {
            if (stopping) return Promise.resolve();
            starting ??= (async () => {
                await connect();
                if (stopping) return;
                await Promise.all(workers.map((worker) => worker.run(onError)));
                if (stopping) return;
                for (const monitor of monitors) monitor.startMonitoring();
            })();
            return starting;
        },
        close() {
            stopping = true;
            closing ??= (async () => {
                const drains = Promise.allSettled([
                    ...workers.map((worker) => worker.close()),
                    ...monitors.map((monitor) => monitor.close()),
                ]);
                // A database connection already being opened must settle before
                // disconnecting it. No consumer can start after stopping=true.
                await starting?.catch(() => {});
                const results = await drains;
                await disconnect();
                const failures = results.filter((r) => r.status === "rejected");
                if (failures.length) {
                    throw new AggregateError(
                        failures.map((r) => r.reason),
                        "Worker shutdown failed",
                    );
                }
            })();
            return closing;
        },
    };
}
