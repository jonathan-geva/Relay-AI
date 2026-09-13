import assert from "node:assert/strict";
import { test } from "node:test";
import { scheduleAbort } from "../src/request-lifecycle.ts";

const nextTask = () => new Promise((resolve) => setTimeout(resolve, 5));

test("a development remount keeps the active request alive", async () => {
  const controller = new AbortController();
  let mounted = false;
  const cancel = scheduleAbort(controller, () => mounted);
  mounted = true;
  cancel();
  await nextTask();
  assert.equal(controller.signal.aborted, false);
});

test("real navigation aborts the active request", async () => {
  const controller = new AbortController();
  scheduleAbort(controller, () => false);
  await nextTask();
  assert.equal(controller.signal.aborted, true);
});
