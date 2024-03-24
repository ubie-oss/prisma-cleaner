import { PrismaClient } from "@prisma/client";
import { cleaner } from "./cleaner";
import * as fabbrica from "./src/__generated__/fabbrica";

jest.mock("./src/client", () => {
  return {
    prisma: new PrismaClient().$extends(cleaner.withCleaner()),
  };
});

const prisma = new PrismaClient().$extends(cleaner.withCleaner());
fabbrica.initialize({ prisma });

afterEach(async () => {
  await cleaner.cleanup();
});
