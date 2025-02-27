import { DatabaseProvider } from "./provider.interface";
import { Table } from "../types";

export class MySQLProvider implements DatabaseProvider {
  formatTableName(schema: string, table: string): string {
    return `\`${table}\``;
  }

  async getTables(
    queryRaw: <T = unknown>(query: string, ...values: unknown[]) => Promise<T>,
  ): Promise<Table[]> {
    return await queryRaw<Table[]>(
      `
SELECT table_name AS \`table\`, table_schema AS \`schema\`
FROM information_schema.tables
WHERE table_schema = DATABASE()
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

    await queryRaw("SET FOREIGN_KEY_CHECKS = 0;");
    for (const target of targets) {
      await queryRaw(`TRUNCATE TABLE ${target}`);
    }
    await queryRaw("SET FOREIGN_KEY_CHECKS = 1;");
  }

  async cleanupTables(
    tableNames: string[],
    queryRaw: <T = unknown>(query: string, ...values: unknown[]) => Promise<T>,
  ): Promise<void> {
    const targets = tableNames.map((target) => {
      // MySQL doesn't support schema.table notation in the same way
      const tableName = target.includes(".")
        ? target.split(".").pop()!
        : target;
      return `\`${tableName.replace(/^"|"$/g, "")}\``;
    });

    await queryRaw("SET FOREIGN_KEY_CHECKS = 0;");
    for (const target of targets) {
      await queryRaw(`TRUNCATE TABLE ${target}`);
    }
    await queryRaw("SET FOREIGN_KEY_CHECKS = 1;");
  }

  async cleanupTargetTables(
    targetTableNames: string[],
    schemaListByTableName: Record<string, string[]>,
    queryRaw: <T = unknown>(query: string, ...values: unknown[]) => Promise<T>,
  ): Promise<void> {
    if (targetTableNames.length === 0) return;

    const targets = targetTableNames.map((table) => `\`${table}\``);

    await queryRaw("SET FOREIGN_KEY_CHECKS = 0;");
    for (const target of targets) {
      await queryRaw(`TRUNCATE TABLE ${target}`);
    }
    await queryRaw("SET FOREIGN_KEY_CHECKS = 1;");
  }
}
