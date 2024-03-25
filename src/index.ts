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
  fields: readonly {
    name: string;
    kind: string;
    type: string;
  }[];
};

type Table = {
  table: string;
  schema: string;
};

const targetOperations = ["create", "createMany", "upsert"];

function isPlainObject(obj: unknown): obj is Record<string, unknown> {
  return obj != null && Object.getPrototypeOf(obj) === Object.prototype;
}

export class PrismaCleaner {
  private readonly prisma: PrismaClientLike;
  private readonly cleanupTargetModels = new Set<string>();
  private readonly modelsMap = new Map<
    string, // model name
    {
      table: string;
      fields: readonly {
        name: string;
        kind: string;
        type: string;
      }[];
    }
  >();

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
    this.modelsMap = new Map(
      models.map((model) => [
        model.name,
        {
          table: model.dbName || model.name,
          fields: model.fields,
        },
      ]),
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
            self.addTargetModelByArgs(model, args);
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
        return this.modelsMap.get(model)?.table;
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

  private addTargetModelByArgs(modelName: string, args: unknown): void {
    if (!isPlainObject(args)) return;
    this.addTargetModelByInputData(modelName, args.data);
  }

  private addTargetModelByInputData(modelName: string, data: unknown): void {
    const model = this.modelsMap.get(modelName);
    if (!model) return;

    if (Array.isArray(data)) {
      data.forEach((d) => this.addTargetModelByInputData(modelName, d));
      return;
    }
    if (!isPlainObject(data)) return;

    for (const [key, value] of Object.entries(data)) {
      if (!isPlainObject(value)) continue;
      if (isPlainObject(value.create)) {
        const field = model.fields.find((f) => f.name === key);
        if (field) {
          this.cleanupTargetModels.add(field.type);
          this.addTargetModelByInputData(field.type, value.create);
        }
      }
      if (
        isPlainObject(value.connectOrCreate) &&
        isPlainObject(value.connectOrCreate.create)
      ) {
        const field = model.fields.find((f) => f.name === key);
        if (field) {
          this.cleanupTargetModels.add(field.type);
          this.addTargetModelByInputData(
            field.type,
            value.connectOrCreate.create,
          );
        }
      }
    }
  }
}
