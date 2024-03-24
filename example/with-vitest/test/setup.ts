import { afterEach } from "vitest";
import { cleaner } from "./cleaner";

afterEach(async () => {
  await cleaner.cleanup();
});
