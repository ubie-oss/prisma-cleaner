import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaCleaner } from "../../src";

export const cleaner = new PrismaCleaner({
  prisma: new PrismaClient(),
  models: Prisma.dmmf.datamodel.models,
});
