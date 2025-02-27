import { Table } from "../types";

export interface DatabaseProvider {
  /**
   * Format a table name according to the database's syntax
   */
  formatTableName(schema: string, table: string): string;

  /**
   * Get all tables from the database
   */
  getTables(
    queryRaw: <T = unknown>(query: string, ...values: unknown[]) => Promise<T>,
  ): Promise<Table[]>;

  /**
   * Clean up all tables in the database
   */
  cleanupAllTables(
    tables: Table[],
    queryRaw: <T = unknown>(query: string, ...values: unknown[]) => Promise<T>,
  ): Promise<void>;

  /**
   * Clean up specific tables in the database
   */
  cleanupTables(
    tableNames: string[],
    queryRaw: <T = unknown>(query: string, ...values: unknown[]) => Promise<T>,
  ): Promise<void>;

  /**
   * Clean up tables based on target table names and schema mapping
   */
  cleanupTargetTables(
    targetTableNames: string[],
    schemaListByTableName: Record<string, string[]>,
    queryRaw: <T = unknown>(query: string, ...values: unknown[]) => Promise<T>,
  ): Promise<void>;
}
