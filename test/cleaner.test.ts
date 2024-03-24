import { Prisma, PrismaClient } from "@prisma/client";
import { describe, test, beforeAll, expect } from "vitest";
import { PrismaCleaner } from "../src";

describe("PrismaCleaner", () => {
  const cleaner = new PrismaCleaner({
    prisma: new PrismaClient(),
    models: Prisma.dmmf.datamodel.models,
  });
  const prisma = new PrismaClient().$extends(cleaner.withCleaner());

  beforeAll(async () => {
    await cleaner.cleanupAllTables();
  });

  test("cleanup user table", async () => {
    await prisma.user.create({
      data: {
        email: "xxx",
      },
    });
    expect(await prisma.user.count()).toBe(1);

    await cleaner.cleanup();
    expect(await prisma.user.count()).toBe(0);
  });

  test("manually cleanup", async () => {
    const insert = () =>
      prisma.$executeRaw`insert into "User" (email) values ('xxx')`;

    await insert();
    expect(await prisma.user.count()).toBe(1);

    // `$queryRawUnsafe` does not add tables to cleanup target
    await cleaner.cleanup();
    expect(await prisma.user.count()).toBe(1);

    await cleaner.cleanupTables(["User"]);
    expect(await prisma.user.count()).toBe(0);

    await insert();
    await cleaner.cleanupTables(["public.User"]);
    expect(await prisma.user.count()).toBe(0);

    await insert();
    await cleaner.cleanupTables([`"public"."User"`]);
    expect(await prisma.user.count()).toBe(0);
  });
});
