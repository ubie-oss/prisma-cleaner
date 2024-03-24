import { cleaner } from "./cleaner";

afterEach(async () => {
  await cleaner.cleanup();
});
