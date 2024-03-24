import type { PrismaClient } from "@prisma/client";

export class UserService {
  constructor(private readonly prisma: PrismaClient) {}

  createUser(name: string) {
    return this.prisma.user.create({
      data: { name },
    });
  }

  findUser(id: number) {
    return this.prisma.user.findUnique({
      where: {
        id,
      },
    });
  }
}
