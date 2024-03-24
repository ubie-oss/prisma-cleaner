import { Injectable } from "@nestjs/common";
import { PrismaService } from "./prisma.service";

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  async findUser(id: number) {
    return this.prisma.user.findUnique({
      where: { id },
    });
  }

  async createUser({ name }: { name: string }) {
    return this.prisma.user.create({
      data: { name },
    });
  }
}
