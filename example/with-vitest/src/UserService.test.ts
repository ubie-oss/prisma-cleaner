import { PrismaClient } from "@prisma/client";
import { describe, it, expect } from "vitest";
import { UserService } from "./UserService";
import { cleaner } from "../test/cleaner";

describe("user", () => {
  const prisma = new PrismaClient().$extends(
    cleaner.withCleaner(),
  ) as PrismaClient;
  const userService = new UserService(prisma);

  it("should create a new user", async () => {
    // this record will delete by prisma-cleaner in afterEach defined by setup.ts
    const user = await userService.createUser("xxx");
    expect(user.name).toEqual("xxx");
    expect(await prisma.user.count()).toEqual(1);
  });

  it("should be cleanup user table by cleaner", async () => {
    const count = await prisma.user.count();
    expect(count).toEqual(0);
  });
});
