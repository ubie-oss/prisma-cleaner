import { PrismaClient } from "@prisma/client";
import { vi, afterEach } from "vitest";
import { cleaner } from "./cleaner";

vi.mock("./src/client", () => {
  return {
    prisma: new PrismaClient().$extends(cleaner.withCleaner()),
  };
});

afterEach(async () => {
  await cleaner.cleanup();
});
