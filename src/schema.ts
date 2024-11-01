import { isNull, sql } from "drizzle-orm";
import { int, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const songs = sqliteTable('songs', {
    url: text('url').primaryKey().notNull(),
    title: text('title').notNull(),
    duration: int('duration').notNull(),
    thumbnail: text('thumbnail').notNull(),
});

export const queue = sqliteTable('queue', {
    id: int('id')
        .primaryKey({ autoIncrement: true })
        .notNull(),
    userId: text('userId').notNull(),
    songUrl: text('songUrl')
        .notNull()
        .references(() => songs.url),
    position: int('position')
        .notNull()
        .unique(),
    queuedAt: int('queuedAt', { mode: 'timestamp' })
        .notNull()
        .default(sql`(unixepoch())`),
    dequeuedAt: int('dequeuedAt', { mode: 'timestamp' }),
    slug: text('slug').notNull(),
    startedAt: int('startedAt', { mode: 'timestamp' }),
}, (table) => ({
    slugIdx: uniqueIndex('slug_idx')
        .on(table.slug)
        .where(isNull(table.dequeuedAt)),
}));
