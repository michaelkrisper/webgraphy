import { openDB } from "idb";
import "fake-indexeddb/auto"; // needed to run in node
import { performance } from "perf_hooks";

const DB_NAME = "test-db";
const APP_STATE_STORE = "app_state";

async function run() {
  const db = await openDB(DB_NAME, 1, {
    upgrade(db) {
      db.createObjectStore(APP_STATE_STORE);
    },
  });

  await db.put(APP_STATE_STORE, { a: 1 }, "webgraphy-viewport");
  await db.put(APP_STATE_STORE, { b: 2 }, "webgraphy-config");
  await db.put(APP_STATE_STORE, { c: 3 }, "webgraphy-state");

  const startIndividual = performance.now();
  for (let i = 0; i < 1000; i++) {
    await Promise.all([
      db.get(APP_STATE_STORE, "webgraphy-viewport"),
      db.get(APP_STATE_STORE, "webgraphy-config"),
      db.get(APP_STATE_STORE, "webgraphy-state"),
    ]);
  }
  const endIndividual = performance.now();

  const startBatch = performance.now();
  for (let i = 0; i < 1000; i++) {
    const tx = db.transaction(APP_STATE_STORE, "readonly");
    const store = tx.objectStore(APP_STATE_STORE);
    await Promise.all([
      store.get("webgraphy-viewport"),
      store.get("webgraphy-config"),
      store.get("webgraphy-state"),
    ]);
    await tx.done;
  }
  const endBatch = performance.now();

  console.log(`Individual: ${(endIndividual - startIndividual).toFixed(2)}ms`);
  console.log(`Batch: ${(endBatch - startBatch).toFixed(2)}ms`);
}

run();
