import type { StartLabels } from "./getting-started";

type T = (key: string) => string;

/** The programme's copy, read once on the server and handed to the client components. */
export function startLabels(t: T): StartLabels {
  return {
    title: t("title"),
    lead: t("lead"),
    progress: t("progress"),
    minutes: t("minutes"),
    locked: t("locked"),
    done: t("done"),
    waiting: t("waitingLive"),
    hide: t("hide"),
    show: t("show"),
    tracks: {
      connect: t("tracks.connect"),
      sell: t("tracks.sell"),
      automate: t("tracks.automate"),
    },
    steps: {
      provider: t("provider"),
      property: t("property"),
      live: t("live"),
      channel: t("channel"),
      rates: t("rates"),
      engine: t("engine"),
      owner: t("owner"),
      template: t("template"),
      automation: t("automation"),
      crew: t("crew"),
    },
  };
}
