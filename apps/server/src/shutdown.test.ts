import { describe, expect, it } from "vitest";
import type { Schedule } from "./sections/scheduler.js";
import { shutdown } from "./shutdown.js";

const settle = () => new Promise((resolve) => setImmediate(resolve));

describe("shutdown", () => {
  it("closes the app, waits for every job to stop, then closes the database", async () => {
    const order: string[] = [];
    let finishPoll: () => void = () => undefined;
    const seatPoller: Schedule = {
      stop: () =>
        new Promise<void>((resolve) => {
          finishPoll = () => {
            order.push("seat poller stopped");
            resolve();
          };
        }),
    };
    const sectionScrape: Schedule = {
      stop: async () => {
        order.push("section scrape stopped");
      },
    };

    const done = shutdown({
      app: { close: async () => void order.push("app closed") },
      schedules: [sectionScrape, seatPoller, undefined],
      database: { close: async () => void order.push("database closed") },
    });
    await settle();
    expect(order).toEqual(["app closed", "section scrape stopped"]);

    finishPoll();
    await done;
    expect(order).toEqual([
      "app closed",
      "section scrape stopped",
      "seat poller stopped",
      "database closed",
    ]);
  });
});
