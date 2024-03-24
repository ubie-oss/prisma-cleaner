import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { UserService } from "./user.service";

@Controller()
export class AppController {
  constructor(private readonly userService: UserService) {}

  @Get("/users/:id")
  async getUser(@Param() params: { id: string }) {
    return this.userService.findUser(Number(params.id));
  }

  @Post("/users")
  async createUser(@Body() body: { name: string }) {
    return this.userService.createUser({ name: body.name });
  }
}
