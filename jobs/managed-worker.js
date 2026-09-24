// Own one BullMQ consumer for the lifetime of this process. run() starts the
// consumer; its returned promise must not wait for the consumer's entire life.
export function managedWorker(createWorker, prepare = async () => {}) {
    let worker;
    let starting;
    let closing;
    let stopping = false;

    return {
        run(onError) {
            if (stopping) return Promise.resolve();
            starting ??= (async () => {
                await prepare();
                if (stopping) return;
                worker = createWorker();
                worker.on("error", (error) => {
                    console.error("Worker connection/processing error:", error);
                });
                worker.run().catch(onError);
                await worker.waitUntilReady();
            })();
            return starting;
        },
        close() {
            stopping = true;
            // Start closing immediately, before waiting for startup or another
            // consumer. BullMQ stops fetching and renews locks while draining.
            closing ??= (async () => {
                const drain = worker?.close();
                const [result] = await Promise.allSettled([drain, starting]);
                if (result.status === "rejected") throw result.reason;
            })();
            return closing;
        },
    };
}
