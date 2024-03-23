import { prisma } from "./client";

export function createUser(email: string) {
  return prisma.user.create({
    data: {
      email,
    },
  });
}

export function findUser(id: number) {
  return prisma.user.findUnique({
    where: {
      id,
    },
  });
}
