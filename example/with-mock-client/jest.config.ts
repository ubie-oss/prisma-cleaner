import type { Config } from "jest";

const config: Config = {
  moduleFileExtensions: ["js", "json", "ts"],
  rootDir: ".",
  testEnvironment: "node",
  testRegex: ".test.ts$",
  transform: {
    "^.+\\.ts$": "ts-jest",
  },
  maxWorkers: 1,
  globalSetup: "<rootDir>/test/global-setup.ts",
  setupFilesAfterEnv: ["<rootDir>/test/setup.ts"],
};

export default config;
