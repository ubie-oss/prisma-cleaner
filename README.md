# prisma-cleaner

prisma-cleaner is a prisma extension to automatically delete data when running tests using prisma. Performance is optimized by executing deletion only on tables where data has been added.

```typescript
import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaCleaner } from "@ubie/prisma-cleaner";

// The provider will be automatically detected from the Prisma client
const cleaner = new PrismaCleaner({
  prisma: new PrismaClient(),
  models: Prisma.dmmf.datamodel.models,
  // You can explicitly specify the provider if needed:
  // provider: 'postgresql' // or 'mysql'
});

const prisma = new PrismaClient().$extends(cleaner.withCleaner());

(async () => {
  await prisma.user.create({ ... });

  // Delete only user table
  await cleaner.cleanup(); 
  // PostgreSQL: TRUNCATE TABLE "public"."user" CASCADE
  // MySQL: SET FOREIGN_KEY_CHECKS = 0; TRUNCATE TABLE `user`; SET FOREIGN_KEY_CHECKS = 1;

  await prisma.user.create({ ... });
  await prisma.comment.create({ ... });

  // Delete post and comment tables, user table is not included
  await cleaner.cleanup(); 
  // PostgreSQL: TRUNCATE TABLE "public"."post", "public"."comment" CASCADE
  // MySQL: SET FOREIGN_KEY_CHECKS = 0; TRUNCATE TABLE `post`; TRUNCATE TABLE `comment`; SET FOREIGN_KEY_CHECKS = 1;
})();
```

> [!NOTE]
> Supports PostgreSQL and MySQL databases.
> 
> You can specify the database provider in two ways:
> 
> 1. **Explicitly in the constructor:**
>    ```typescript
>    const cleaner = new PrismaCleaner({
>      prisma: new PrismaClient(),
>      models: Prisma.dmmf.datamodel.models,
>      provider: 'postgresql' // or 'mysql'
>    });
>    ```
> 
> 2. **Automatic detection:**
>    The library will automatically detect the database provider from your Prisma client configuration.
>    This is detected from the Prisma client's internal configuration (`_engineConfig.activeProvider`).> 
> 
> If no provider is specified and automatic detection fails, an error will be thrown.

## Installation

```
$ npm install --save-dev @ubie/prisma-cleaner
```

## Usage

### with jest

#### Application code

```typescript
// ./src/client.ts
import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();
```

```typescript
// ./src/UserService.ts
import type { PrismaClient } from "@prisma/client";

export class UserService {
  constructor(private readonly prisma: PrismaClient) {}
  createUser(name: string) {
    return this.prisma.user.create({
      data: { name },
    });
  }
}
```

#### Test config

```typescript
// jest.config.ts
const config: Config = {
  // ...
  globalSetup: "<rootDir>/test/global-setup.ts",
  setupFilesAfterEnv: ["<rootDir>/test/setup.ts"],
};
```

```typescript
// ./test/cleander.ts
import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaCleaner } from "@ubie/prisma-cleaner";

export const cleaner = new PrismaCleaner({
  prisma: new PrismaClient(),
  models: Prisma.dmmf.datamodel.models,
  // You can explicitly specify the provider if needed:
  // provider: 'postgresql' // or 'mysql'
});
```

```typescript
// ./test/global-setup.ts
import { cleaner } from "./cleaner";

export default async function setup() {
  // This is optional, cleaning all tables first increases the stability of the test.
  await cleaner.cleanupAllTables();
}
```

```typescript
// ./test/setup.ts
import { PrismaClient } from "@prisma/client";
import { cleaner } from "./cleaner";

afterEach(async () => {
  await cleaner.cleanup();
});
```

#### Test code

```typescript
// ./src/UserService.test.ts
import { PrismaClient } from "@prisma/client";
import { UserService } from "./UserService";
import { cleaner } from "../test/cleaner";

describe("UserService", () => {
  const prisma = new PrismaClient().$extends(cleaner.withCleaner()) as PrismaClient;
  const userService = new UserService(prisma);

  it("should create a new user", async () => {
    // this record will delete by prisma-cleaner in afterEach defined by setup.ts
    const user = await userService.createUser("xxx");
    expect(user.name).toEqual("xxx");
    expect(await prisma.user.count()).toEqual(1);
  });

  it("should be cleanup user table by cleaner", async () => {
    const count = await prisma.user.count();
    expect(count).toEqual(0);
  });
});
```

See more [examples](https://github.com/ubie-oss/prisma-cleaner/blob/main//example/with-jest).

### manually cleanup

Prisma-cleaner adds tables targeted for deletion triggered by the execution of Prisma's `create`, `createMany`, `upsert`. If added via `$executeRaw` or similar, they will not be automatically deleted, so you will need to manually delete them.

```typescript
// PostgreSQL
await prisma.$executeRaw`INSERT INTO "User" (name) VALUES ('xxx')`;

// MySQL
// await prisma.$executeRaw`INSERT INTO \`User\` (name) VALUES ('xxx')`;

// You should delete manually.
await cleaner.cleanupTables(["User"]);
```

## License

[MIT License](https://github.com/ubie-oss/prisma-cleaner/blob/main/LICENSE).
