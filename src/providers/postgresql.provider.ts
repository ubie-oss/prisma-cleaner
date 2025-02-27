import { DatabaseProvider } from "./provider.interface";
import { Table } from "../types";

export class PostgreSQLProvider implements DatabaseProvider {
  formatTableName(schema: string, table: string): string {
    return `"${schema}"."${table}"`;
  }

  async getTables(
    queryRaw: <T = unknown>(query: string, ...values: unknown[]) => Promise<T>,
  ): Promise<Table[]> {
    return await queryRaw<Table[]>(
      `
SELECT table_name AS table, table_schema AS schema
FROM information_schema.tables
WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
AND table_name != '_prisma_migrations'
      `.trim(),
    );
  }

  async cleanupAllTables(
    tables: Table[],
    queryRaw: <T = unknown>(query: string, ...values: unknown[]) => Promise<T>,
  ): Promise<void> {
    const targets = tables.map(({ table, schema }) =>
      this.formatTableName(schema, table),
    );
    await queryRaw(`TRUNCATE TABLE ${targets.join(", ")}`);
  }

  async cleanupTables(
    tableNames: string[],
    queryRaw: <T = unknown>(query: string, ...values: unknown[]) => Promise<T>,
  ): Promise<void> {
    const targets = tableNames.map((target) => {
      if (/^".*"$/.test(target)) return target;

      const [schemaOrTable, table] = target.split(".");
      if (table) {
        return `"${schemaOrTable}"."${table}"`;
      } else {
        return `"${schemaOrTable}"`;
      }
    });

    await queryRaw(`TRUNCATE TABLE ${targets.join(", ")} CASCADE`);
  }

  async cleanupTargetTables(
    targetTableNames: string[],
    schemaListByTableName: Record<string, string[]>,
    queryRaw: <T = unknown>(query: string, ...values: unknown[]) => Promise<T>,
  ): Promise<void> {
    const targets = targetTableNames
      .flatMap((table) => {
        return schemaListByTableName[table].map((schema) =>
          this.formatTableName(schema, table),
        );
      })
      .filter((t) => t != null);

    if (targets.length === 0) return;

    await queryRaw(`TRUNCATE TABLE ${targets.join(", ")} CASCADE`);
  }
}
