import { PrismaClient } from "@prisma/client";
import { cleaner } from "./cleaner";

jest.mock("../src/prisma", () => {
  return {
    prisma: new PrismaClient().$extends(cleaner.withCleaner()),
  };
});

afterEach(async () => {
  await cleaner.cleanup();
});
