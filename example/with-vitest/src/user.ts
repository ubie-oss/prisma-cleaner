import { prisma } from "./client";

export function createUser(name: string) {
  return prisma.user.create({
    data: { name },
  });
}

export function findUser(id: number) {
  return prisma.user.findUnique({
    where: {
      id,
    },
  });
}
