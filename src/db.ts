import * as schema from "./schema";
import { drizzle } from "drizzle-orm/bun-sqlite";

// const db = drizzle(process.env.DB_FILE_NAME!, { schema });
// export type Db = typeof db;
// export default db;

export function openDb(path: string) {
    return drizzle(path, { schema });
}

export type Db = ReturnType<typeof openDb>;
