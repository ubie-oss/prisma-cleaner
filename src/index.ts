import { Prisma } from "@prisma/client/extension";
import { DatabaseProvider, ProviderFactory } from "./providers";
import { PrismaClientLike, PrismaCleanerOptions, Table } from "./types";

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
  private provider: DatabaseProvider;

  constructor({ prisma, models, provider }: PrismaCleanerOptions) {
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

    // Determine the database provider using the hybrid approach
    // 1. Use the explicitly provided provider if available
    // 2. Otherwise, try to detect from Prisma client
    // 3. If neither is available, an error will be thrown
    const providerName = provider || this.prisma._engineConfig?.activeProvider;
    this.provider = ProviderFactory.createProvider(providerName);
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
    await this.provider.cleanupAllTables(
      tables,
      this.prisma.$queryRawUnsafe.bind(this.prisma),
    );
  }

  async cleanupTables(tables: string[]): Promise<void> {
    await this.provider.cleanupTables(
      tables,
      this.prisma.$queryRawUnsafe.bind(this.prisma),
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

    await this.provider.cleanupTargetTables(
      targetTableNames,
      schemaListByTableName,
      this.prisma.$queryRawUnsafe.bind(this.prisma),
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
    this.tables = await this.provider.getTables(
      this.prisma.$queryRawUnsafe.bind(this.prisma),
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

      // create
      if (Array.isArray(value.create)) {
        const field = model.fields.find((f) => f.name === key);
        if (field) {
          this.cleanupTargetModels.add(field.type);
        }
        this.addTargetModelByInputData(modelName, value.create);
      } else if (isPlainObject(value.create)) {
        const field = model.fields.find((f) => f.name === key);
        if (field) {
          this.cleanupTargetModels.add(field.type);
          this.addTargetModelByInputData(field.type, value.create);
        }
      }

      // connectOrCreate
      if (Array.isArray(value.connectOrCreate)) {
        const field = model.fields.find((f) => f.name === key);
        if (field) {
          this.cleanupTargetModels.add(field.type);
        }
        value.connectOrCreate.forEach((v) => {
          if (isPlainObject(v.create)) {
            this.addTargetModelByInputData(modelName, v.create);
          }
        });
      } else if (
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
