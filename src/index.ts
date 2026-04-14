import { Prisma } from "@prisma/client/extension";

type PrismaClientLike = {
  $queryRawUnsafe: <T = unknown>(
    query: string,
    ...values: unknown[]
  ) => Promise<T>;
};

type FieldLike = {
  name: string;
  kind: string;
  type: string;
  relationFromFields?: readonly string[];
};

type ModelLike = {
  name: string;
  dbName: string | null;
  fields: readonly FieldLike[];
};

export type CleanupStrategy = "delete" | "truncate";

export type CleanupOptions = {
  strategy?: CleanupStrategy;
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
      fields: readonly FieldLike[];
    }
  >();
  private readonly strategy: CleanupStrategy;
  // model name -> set of model names it depends on (has FK to)
  private readonly dependencyGraph: Map<string, Set<string>>;

  private tables: Table[] | null = null;
  private schemaListByTableName: Record<string, string[]> | null = null;

  constructor({
    prisma,
    models,
    strategy = "truncate",
  }: {
    prisma: PrismaClientLike;
    models: readonly ModelLike[] | ModelLike[];
    strategy?: CleanupStrategy;
  }) {
    this.prisma = prisma;
    this.strategy = strategy;
    this.modelsMap = new Map(
      models.map((model) => [
        model.name,
        {
          table: model.dbName || model.name,
          fields: model.fields,
        },
      ]),
    );
    this.dependencyGraph = this.buildDependencyGraph();
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

  async cleanupTables(
    tables: string[],
    options?: CleanupOptions,
  ): Promise<void> {
    const strategy = options?.strategy ?? this.strategy;
    const targets = tables.map((target) => {
      if (/^".*"$/.test(target)) return target;

      const [schemaOrTable, table] = target.split(".");
      if (table) {
        return `"${schemaOrTable}"."${table}"`;
      } else {
        return `"${schemaOrTable}"`;
      }
    });

    if (strategy === "delete") {
      for (const target of targets) {
        await this.prisma.$queryRawUnsafe(`DELETE FROM ${target}`);
      }
    } else {
      await this.prisma.$queryRawUnsafe(
        `TRUNCATE TABLE ${targets.join(", ")} CASCADE`,
      );
    }
  }

  async cleanup(options?: CleanupOptions): Promise<void> {
    if (this.cleanupTargetModels.size === 0) return;

    const strategy = options?.strategy ?? this.strategy;

    if (strategy === "delete") {
      await this.cleanupWithDelete();
    } else {
      await this.cleanupWithTruncate();
    }

    this.cleanupTargetModels.clear();
  }

  private async cleanupWithTruncate(): Promise<void> {
    const targetTableNames = Array.from(this.cleanupTargetModels)
      .map((model) => this.modelsMap.get(model)?.table)
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
  }

  private async cleanupWithDelete(): Promise<void> {
    // Expand the target set to include all models that transitively depend on
    // the tracked models (i.e., have FK references to them). This matches
    // TRUNCATE CASCADE behavior where dependent rows are automatically removed.
    const modelNames = this.expandWithDependents(
      Array.from(this.cleanupTargetModels),
    );
    const sorted = this.getDeleteOrder(modelNames);
    const schemaListByTableName = await this.getSchemaListByTableName();

    for (const modelName of sorted) {
      const table = this.modelsMap.get(modelName)?.table;
      if (!table) continue;
      const schemas = schemaListByTableName[table];
      if (!schemas) continue;

      for (const schema of schemas) {
        await this.prisma.$queryRawUnsafe(`DELETE FROM "${schema}"."${table}"`);
      }
    }
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

  // Given a set of model names, expand to include all models that transitively
  // depend on them (have FK references pointing to them). This ensures that
  // DELETE operations clean up child rows before parent rows, matching CASCADE behavior.
  private expandWithDependents(modelNames: string[]): string[] {
    const expanded = new Set(modelNames);
    const queue = [...modelNames];

    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const [name, deps] of this.dependencyGraph) {
        if (deps.has(current) && !expanded.has(name)) {
          expanded.add(name);
          queue.push(name);
        }
      }
    }

    return Array.from(expanded);
  }

  private buildDependencyGraph(): Map<string, Set<string>> {
    const dependsOn = new Map<string, Set<string>>();

    for (const [modelName] of this.modelsMap) {
      dependsOn.set(modelName, new Set());
    }

    for (const [modelName, modelData] of this.modelsMap) {
      for (const field of modelData.fields) {
        if (
          field.kind === "object" &&
          field.relationFromFields &&
          field.relationFromFields.length > 0
        ) {
          dependsOn.get(modelName)?.add(field.type);
        }
      }
    }

    return dependsOn;
  }

  // Returns model names in deletion order (children first, parents last) using Kahn's algorithm
  // on the reversed dependency graph.
  private getDeleteOrder(modelNames: string[]): string[] {
    const targetSet = new Set(modelNames);

    // Build in-degree map on the reversed graph: for deletion, we process
    // models that have no dependents first (leaf tables), then work up to parents.
    // "dependents" here means models that have FK references TO this model.
    const inDegree = new Map<string, number>();
    // dependents: model -> list of models that depend on it (have FK to it)
    const dependents = new Map<string, string[]>();

    for (const name of modelNames) {
      inDegree.set(name, 0);
      dependents.set(name, []);
    }

    for (const name of modelNames) {
      const deps = this.dependencyGraph.get(name);
      if (!deps) continue;
      for (const dep of deps) {
        if (targetSet.has(dep)) {
          // 'name' depends on 'dep', so 'name' is a dependent of 'dep'
          // In the reversed graph, 'name' must come before 'dep'
          // So 'dep' has an in-degree from 'name'
          inDegree.set(dep, (inDegree.get(dep) ?? 0) + 1);
          dependents.get(name)!.push(dep);
        }
      }
    }

    // Start with models that have no dependents in the target set (leaf tables)
    const queue: string[] = [];
    for (const [name, degree] of inDegree) {
      if (degree === 0) {
        queue.push(name);
      }
    }

    const result: string[] = [];
    while (queue.length > 0) {
      const current = queue.shift()!;
      result.push(current);

      for (const parent of dependents.get(current) ?? []) {
        const newDegree = (inDegree.get(parent) ?? 1) - 1;
        inDegree.set(parent, newDegree);
        if (newDegree === 0) {
          queue.push(parent);
        }
      }
    }

    return result;
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
