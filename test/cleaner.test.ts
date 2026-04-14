import { Prisma, PrismaClient } from "@prisma/client";
import { describe, test, beforeAll, expect } from "vitest";
import { PrismaCleaner, CleanupStrategy } from "../src";

const strategies: CleanupStrategy[] = ["truncate", "delete"];

describe.each(strategies)("PrismaCleaner (strategy: %s)", (strategy) => {
  const cleaner = new PrismaCleaner({
    prisma: new PrismaClient(),
    models: Prisma.dmmf.datamodel.models,
    strategy,
  });
  const prisma = new PrismaClient().$extends(cleaner.withCleaner());

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
    const insert = () =>
      prisma.$executeRaw`insert into "User" (name) values ('xxx')`;

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

describe("PrismaCleaner delete strategy with DB-level FK augmentation", () => {
  // Strip relationFromFields to simulate models where @relation is intentionally
  // omitted (e.g., cross-module FKs in modular monoliths). The DMMF-based dependency
  // graph will be empty, so augmentDependencyGraphFromDB must fill in the gaps.
  const modelsWithoutRelations = Prisma.dmmf.datamodel.models.map((model) => ({
    ...model,
    fields: model.fields.map((field) => ({
      ...field,
      relationFromFields: undefined,
    })),
  }));

  const cleaner = new PrismaCleaner({
    prisma: new PrismaClient(),
    models: modelsWithoutRelations,
    strategy: "delete",
  });
  const prisma = new PrismaClient().$extends(cleaner.withCleaner());

  beforeAll(async () => {
    await cleaner.cleanupAllTables();
  });

  test("resolves FK ordering from DB when DMMF relations are missing", async () => {
    await prisma.post.create({
      data: {
        title: "test",
        content: "test",
        comment: {
          create: [{ body: "comment1" }, { body: "comment2" }],
        },
      },
    });

    expect(await prisma.post.count()).toBe(1);
    expect(await prisma.comment.count()).toBe(2);

    // Without augmentDependencyGraphFromDB, this would fail with FK violation
    // because the cleaner wouldn't know comments depend on posts
    await cleaner.cleanup();
    expect(await prisma.post.count()).toBe(0);
    expect(await prisma.comment.count()).toBe(0);
  });
});

describe("PrismaCleaner cleanup options override", () => {
  const cleaner = new PrismaCleaner({
    prisma: new PrismaClient(),
    models: Prisma.dmmf.datamodel.models,
    strategy: "truncate",
  });
  const prisma = new PrismaClient().$extends(cleaner.withCleaner());

  beforeAll(async () => {
    await cleaner.cleanupAllTables();
  });

  test("override strategy at cleanup call", async () => {
    await prisma.user.create({
      data: { name: "xxx" },
    });
    expect(await prisma.user.count()).toBe(1);

    await cleaner.cleanup({ strategy: "delete" });
    expect(await prisma.user.count()).toBe(0);
  });

  test("override strategy at cleanupTables call", async () => {
    await prisma.$executeRaw`insert into "User" (name) values ('xxx')`;
    expect(await prisma.user.count()).toBe(1);

    await cleaner.cleanupTables(["User"], { strategy: "delete" });
    expect(await prisma.user.count()).toBe(0);
  });
});
