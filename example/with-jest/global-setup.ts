import { cleaner } from "./cleaner";

export default async function setup() {
  await cleaner.cleanupAllTables();
}
