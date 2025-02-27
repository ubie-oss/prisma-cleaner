import { SupportedProvider } from "./providers";

export type Table = {
  table: string;
  schema: string;
};

export type PrismaClientLike = {
  $queryRawUnsafe: <T = unknown>(
    query: string,
    ...values: unknown[]
  ) => Promise<T>;
  _engineConfig?: {
    activeProvider: string;
  };
};

export type ModelLike = {
  name: string;
  dbName: string | null;
  fields: readonly {
    name: string;
    kind: string;
    type: string;
  }[];
};

export type PrismaCleanerOptions = {
  prisma: PrismaClientLike;
  models: readonly ModelLike[] | ModelLike[];
  provider?: SupportedProvider;
};
