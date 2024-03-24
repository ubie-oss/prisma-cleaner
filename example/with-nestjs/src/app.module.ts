import { Module } from "@nestjs/common";
import { AppController } from "./app.controller";
import { PrismaService } from "./prisma.service";
import { UserService } from "./user.service";

@Module({
  providers: [UserService, PrismaService],
  controllers: [AppController],
})
export class AppModule {}
