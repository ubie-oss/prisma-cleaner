import { prisma } from "./client";
import { createUser } from "./user";

describe("user", () => {
  it("should create a new user", async () => {
    // this record will delete by prisma-cleaner in afterEach defined by setup.ts
    const created = await createUser("xxx");
    expect(created.name).toEqual("xxx");
    expect(await prisma.user.count()).toEqual(1);
  });

  it("should be cleanup user table by cleaner", async () => {
    const count = await prisma.user.count();
    expect(count).toEqual(0);
  });
});
