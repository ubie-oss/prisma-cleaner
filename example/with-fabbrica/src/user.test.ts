import { defineUserFactory } from "./__generated__/fabbrica";
import { prisma } from "./client";
import { createUser } from "./user";

const UserFactory = defineUserFactory();

describe("user", () => {
  it("should create a new user", async () => {
    // this record will delete by prisma-cleaner in afterEach defined by setup.ts
    const created = await createUser("xxx");
    expect(created.email).toEqual("xxx");

    const user = await UserFactory.create();
    expect(user).toBeDefined();

    expect(await prisma.user.count()).toEqual(2);
  });

  it("should be cleanup user table by cleaner", async () => {
    const count = await prisma.user.count();
    expect(count).toEqual(0);
  });
});
