import { PrismaClient } from "@prisma/client";
import { definePostFactory, defineUserFactory } from "./__generated__/fabbrica";
import { cleaner } from "../test/cleaner";

const UserFactory = defineUserFactory();
const PostFactory = definePostFactory({
  defaultData: {
    user: UserFactory,
  },
});

describe("UserService", () => {
  const prisma = new PrismaClient().$extends(
    cleaner.withCleaner(),
  ) as PrismaClient;
  it("should create a new user", async () => {
    // this record will delete by prisma-cleaner in afterEach defined by setup.ts
    const post = await PostFactory.create({ title: "xxx" });
    expect(post.title).toEqual("xxx");

    expect(await prisma.user.count()).toEqual(1);
    expect(await prisma.post.count()).toEqual(1);
  });

  it("should be cleanup user table by cleaner", async () => {
    expect(await prisma.user.count()).toEqual(0);
    expect(await prisma.post.count()).toEqual(0);
  });
});
