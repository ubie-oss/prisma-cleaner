import { prisma } from "./client";
import { createUser } from "./user";

describe("user", () => {
  it("should be able to create a new user", async () => {
    const created = await createUser("xxx");
    expect(created.email).toEqual("xxx");
  });

  it("should be cleanup user table", async () => {
    const count = await prisma.user.count();
    expect(count).toEqual(0);
  });
});
