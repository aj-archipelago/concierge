export const legacy = `
(async () => {
  const cached = await ConciergeSDK.data.get("atmosphereUrl");
  let url = cached?.found ? (cached.value?.url || cached.value) : null;
  if (!url) {
    const started = await ConciergeSDK.media.createImage({prompt: "A newsroom", aspectRatio: "16:9"});
    const task = await ConciergeSDK.tasks.wait(started.taskId);
    url = task.data?.azureUrl || task.data?.url || task.data?.gcsUrl;
    if (url) await ConciergeSDK.data.set("atmosphereUrl", { url });
  }
  return url;
})()`;
