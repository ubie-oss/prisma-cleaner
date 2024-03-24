import { Prisma } from "@prisma/client/extension";

type PrismaClientLike = {
  $queryRawUnsafe: <T = unknown>(
    query: string,
    ...values: unknown[]
  ) => Promise<T>;
};

type ModelLike = {
  name: string;
  dbName: string | null;
};

type Table = {
  table: string;
  schema: string;
};

const targetOperations = ["create", "createMany", "upsert"];

export class PrismaCleaner {
  private readonly prisma: PrismaClientLike;
  private readonly cleanupTargetModels = new Set<string>();
  private readonly tableByModel = new Map<string, string>();

  private tables: Table[] | null = null;
  private schemaListByTableName: Record<string, string[]> | null = null;

  constructor({
    prisma,
    models,
  }: {
    prisma: PrismaClientLike;
    models: readonly ModelLike[] | ModelLike[];
  }) {
    this.prisma = prisma;
    this.tableByModel = new Map(
      models.map((model) => [model.name, model.dbName || model.name]),
    );
  }

  withCleaner() {
    const self = this;

    return Prisma.defineExtension({
      name: "prisma-cleaner-extension",
      query: {
        async $allOperations({ operation, model, args, query }) {
          if (model && targetOperations.includes(operation)) {
            self.cleanupTargetModels.add(model);
          }
          return query(args);
        },
      },
    });
  }

  async cleanupAllTables(): Promise<void> {
    const tables = await this.getTables();
    const targets = tables.map(({ table, schema }) => `"${schema}"."${table}"`);
    await this.prisma.$queryRawUnsafe(`TRUNCATE TABLE ${targets.join(", ")}`);
  }

  async cleanupTables(tables: string[]): Promise<void> {
    const targets = tables.map((target) => {
      if (/^".*"$/.test(target)) return target;

      const [schemaOrTable, table] = target.split(".");
      if (table) {
        return `"${schemaOrTable}"."${table}"`;
      } else {
        return `"${schemaOrTable}"`;
      }
    });
    await this.prisma.$queryRawUnsafe(
      `TRUNCATE TABLE ${targets.join(", ")} CASCADE`,
    );
  }

  async cleanup(): Promise<void> {
    if (this.cleanupTargetModels.size === 0) return;

    const targetTableNames = Array.from(this.cleanupTargetModels)
      .map((model) => {
        return this.tableByModel.get(model);
      })
      .filter((table): table is string => table != null);
    const schemaListByTableName = await this.getSchemaListByTableName();

    // If the multiSchema feature is enabled, we don't know how to obtain the schema name from the model,
    // so we instead get the schema name from the table name. Also, we don't know which schema the model
    // belongs to, so we delete the table with the same name from all schemas.
    const targets = targetTableNames
      .flatMap((table) => {
        return schemaListByTableName[table].map(
          (schema) => `"${schema}"."${table}"`,
        );
      })
      .filter((t) => t != null);
    if (targets.length === 0) return;

    await this.prisma.$queryRawUnsafe(
      `TRUNCATE TABLE ${targets.join(", ")} CASCADE`,
    );
    this.cleanupTargetModels.clear();
  }

  private async getSchemaListByTableName(): Promise<Record<string, string[]>> {
    if (this.schemaListByTableName) return this.schemaListByTableName;

    const tables = await this.getTables();
    this.schemaListByTableName = tables.reduce<Record<string, string[]>>(
      (acc, { table, schema }) => {
        if (acc[table]) {
          acc[table].push(schema);
        } else {
          acc[table] = [schema];
        }
        return acc;
      },
      {},
    );
    return this.schemaListByTableName;
  }

  private async getTables(): Promise<Table[]> {
    if (this.tables) return this.tables;

    this.tables = await this.prisma.$queryRawUnsafe<Table[]>(
      `
SELECT table_name AS table, table_schema AS schema
FROM information_schema.tables
WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
AND table_name != '_prisma_migrations'
  `.trim(),
    );
    return this.tables;
  }
}
