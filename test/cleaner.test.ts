import { Prisma, PrismaClient } from "@prisma/client";
import { describe, test, beforeAll, expect } from "vitest";
import { PrismaCleaner } from "../src";

describe("PrismaCleaner", () => {
  // Get the provider from the Prisma client
  const prismaClient = new PrismaClient();
  const provider = (prismaClient as any)._engineConfig?.activeProvider;

  const cleaner = new PrismaCleaner({
    prisma: prismaClient,
    models: Prisma.dmmf.datamodel.models,
    provider: provider as "postgresql" | "mysql", // Explicitly specify the provider
  });
  const prisma = prismaClient.$extends(cleaner.withCleaner());

  beforeAll(async () => {
    await cleaner.cleanupAllTables();
  });

  test("cleanup user table", async () => {
    await prisma.user.create({
      data: {
        name: "xxx",
      },
    });
    expect(await prisma.user.count()).toBe(1);

    await cleaner.cleanup();
    expect(await prisma.user.count()).toBe(0);
  });

  test("with transaction", async () => {
    await prisma.$transaction(async (client) => {
      await client.user.create({
        data: {
          name: "foo",
        },
      });
      await client.user.create({
        data: {
          name: "bar",
        },
      });
    });
    expect(await prisma.user.count()).toBe(2);

    await cleaner.cleanup();
    expect(await prisma.user.count()).toBe(0);
  });

  test("with nesting", async () => {
    await prisma.post.create({
      data: {
        title: "yyy",
        content: "zzz",
        comment: {
          create: [
            {
              body: "foo",
              user: {
                connectOrCreate: {
                  where: {
                    id: 1,
                  },
                  create: {
                    name: "foo",
                  },
                },
              },
            },
            {
              body: "bar",
            },
          ],
        },
      },
    });
    expect(await prisma.user.count()).toBe(1);
    expect(await prisma.post.count()).toBe(1);
    expect(await prisma.comment.count()).toBe(2);

    await cleaner.cleanup();
    expect(await prisma.user.count()).toBe(0);
    expect(await prisma.post.count()).toBe(0);
    expect(await prisma.comment.count()).toBe(0);
  });

  test("many connectOrCreate", async () => {
    await prisma.post.create({
      data: {
        title: "yyy",
        content: "zzz",
        comment: {
          connectOrCreate: [
            {
              where: { id: 1 },
              create: {
                body: "foo",
                user: {
                  create: {
                    name: "x",
                  },
                },
              },
            },
            {
              where: { id: 2 },
              create: { body: "bar" },
            },
          ],
        },
      },
    });
    expect(await prisma.user.count()).toBe(1);
    expect(await prisma.post.count()).toBe(1);
    expect(await prisma.comment.count()).toBe(2);

    await cleaner.cleanup();
    expect(await prisma.user.count()).toBe(0);
    expect(await prisma.post.count()).toBe(0);
    expect(await prisma.comment.count()).toBe(0);
  });

  test("createMany", async () => {
    await prisma.post.createMany({
      data: [
        { title: "a", content: "b" },
        { title: "x", content: "y" },
      ],
    });
    expect(await prisma.post.count()).toBe(2);

    await cleaner.cleanup();
    expect(await prisma.post.count()).toBe(0);
  });

  test("manually cleanup", async () => {
    const isMySQL = provider === "mysql";

    // Define insert function based on the database provider
    const insert = isMySQL
      ? () => prisma.$executeRaw`INSERT INTO \`User\` (name) VALUES ('xxx')`
      : () => prisma.$executeRaw`INSERT INTO "User" (name) VALUES ('xxx')`;

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
