import { MySQLProvider } from "./mysql.provider";
import { PostgreSQLProvider } from "./postgresql.provider";
import { DatabaseProvider } from "./provider.interface";

export type SupportedProvider = "postgresql" | "mysql";

export class ProviderFactory {
  static createProvider(provider: string | undefined): DatabaseProvider {
    if (!this.isSupportedProvider(provider)) {
      throw new Error(
        'Database provider not specified or invalid. Please set DATABASE_PROVIDER environment variable to either "postgresql" or "mysql".',
      );
    }

    switch (provider) {
      case "mysql":
        return new MySQLProvider();
      case "postgresql":
        return new PostgreSQLProvider();
    }
  }

  static isSupportedProvider(
    provider: string | undefined,
  ): provider is SupportedProvider {
    return provider === "postgresql" || provider === "mysql";
  }
}
