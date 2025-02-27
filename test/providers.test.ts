import { describe, test, expect } from "vitest";
import {
  MySQLProvider,
  PostgreSQLProvider,
  ProviderFactory,
} from "../src/providers";

describe("ProviderFactory", () => {
  test("should create PostgreSQLProvider for postgresql", () => {
    const provider = ProviderFactory.createProvider("postgresql");
    expect(provider).toBeInstanceOf(PostgreSQLProvider);
  });

  test("should create MySQLProvider for mysql", () => {
    const provider = ProviderFactory.createProvider("mysql");
    expect(provider).toBeInstanceOf(MySQLProvider);
  });

  test("should throw error for undefined provider", () => {
    expect(() => ProviderFactory.createProvider(undefined)).toThrow(
      "Database provider not specified",
    );
  });

  test("should throw error for invalid provider", () => {
    expect(() => ProviderFactory.createProvider("invalid" as any)).toThrow(
      "Database provider not specified or invalid",
    );
  });

  test("isSupportedProvider should validate provider strings", () => {
    expect(ProviderFactory.isSupportedProvider("postgresql")).toBe(true);
    expect(ProviderFactory.isSupportedProvider("mysql")).toBe(true);
    expect(ProviderFactory.isSupportedProvider("invalid")).toBe(false);
    expect(ProviderFactory.isSupportedProvider(undefined)).toBe(false);
  });
});
