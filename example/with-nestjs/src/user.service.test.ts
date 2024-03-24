import { Test } from "@nestjs/testing";
import { PrismaClient } from "@prisma/client";
import { PrismaService } from "./prisma.service";
import { UserService } from "./user.service";
import { cleaner } from "../test/cleaner";

describe("UserService", () => {
  let userService: UserService;
  const prisma = new PrismaClient().$extends(cleaner.withCleaner());

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        UserService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();
    userService = moduleRef.get(UserService);
  });

  it("should create a new user", async () => {
    const user = await userService.createUser({ name: "xxx" });
    expect(user.name).toEqual("xxx");
    expect(await prisma.user.count()).toEqual(1);
  });

  it("should be cleanup user table by cleaner", async () => {
    const count = await prisma.user.count();
    expect(count).toEqual(0);
  });
});
