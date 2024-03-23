import { PrismaClient } from "@prisma/client";
import { cleaner } from "./cleaner";

jest.mock("./src/client", () => {
  return {
    prisma: new PrismaClient().$extends(cleaner.withCleaner()),
  };
});

afterEach(async () => {
  await cleaner.cleanup();
});
