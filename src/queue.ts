import { type Db } from "./db";
import * as schema from "./schema";
import { and, count, eq, gte, isNull, SQL, sql, lte, lt, gt, like, or } from "drizzle-orm";
import { EventEmitter } from "events";
import { FIFOQueueScheduler, type QueueScheduler } from "./sheduler";

export type QueuedSong = typeof schema.songs.$inferSelect & Omit<typeof schema.queue.$inferSelect, 'songUrl'>;
export type NewSong = typeof schema.songs.$inferInsert;
export type NewQueueSong = NewSong & { userId: string, slug: string };
type DbTx = Parameters<Parameters<Db['transaction']>[0]>[0];

export class QueueTx {
    constructor(
        private tx: DbTx,
        private events: EventEmitter,
        private scheduler: QueueScheduler,
    ) {}

    findOneByCondition(condition: SQL<unknown>): QueuedSong | undefined {
        const result = this.tx
            .select()
            .from(schema.queue)
            .innerJoin(schema.songs, eq(schema.queue.songUrl, schema.songs.url))
            .where(condition)
            .limit(1)
            .get();

        if (!result)
            return undefined;

        return {
            ...result.queue,
            ...result.songs,
        };
    }

    findByCondition(condition: SQL<unknown>): QueuedSong[] {
        const rows = this.tx
            .select()
            .from(schema.queue)
            .innerJoin(schema.songs, eq(schema.queue.songUrl, schema.songs.url))
            .where(condition)
            .all();
        
        return rows.map((row) => ({
            ...row.queue,
            ...row.songs,
        }));
    }

    countByCondition(condition: SQL<unknown>): number {
        const result = this.tx
            .select({ count: count() })
            .from(schema.queue)
            .where(condition)
            .get();

        return result?.count ?? 0;
    }

    findQueued(n: number, offset=0): QueuedSong[] {
        const rows = this.tx
            .select()
            .from(schema.queue)
            .innerJoin(schema.songs, eq(schema.queue.songUrl, schema.songs.url))
            .where(gte(schema.queue.position, offset))
            .orderBy(schema.queue.position)
            .limit(n)
            .all();

        return rows.map((row) => ({
            ...row.queue,
            ...row.songs,
        }));
    }

    findById(id: number): QueuedSong | undefined {
        return this.findOneByCondition(eq(schema.queue.id, id));
    }

    findByUserId(userId: string): QueuedSong[] {
        return this.findByCondition(eq(schema.queue.userId, userId));
    }

    countQueued(): number {
        const result = this.tx
            .select({ count: count() })
            .from(schema.queue)
            .where(isNull(schema.queue.dequeuedAt))
            .get();

        return result?.count ?? 0;
    }

    countQueuedByUserId(userId: string): number {
        const result = this.tx
            .select({ count: count() })
            .from(schema.queue)
            .where(and(eq(schema.queue.userId, userId), isNull(schema.queue.dequeuedAt)))
            .get();

        return result?.count ?? 0;
    }

    maxQueuePosition(): number {
        return this.tx
            .select({ max: sql<number>`COALESCE(MAX(${schema.queue.position}), -1)` })
            .from(schema.queue)
            .get()!.max;
    }

    moveSong(song: QueuedSong, newPosition: number): void {
        const oldPosition = song.position;
        if (oldPosition < 0)
            throw new Error("Attempted to move dequeued song");
        if (oldPosition == newPosition)
            return;

        const maxPosition = this.maxQueuePosition();
        if (newPosition < 0 || newPosition > maxPosition + 1)
            throw new Error('Invalid queue position');

        if (newPosition < oldPosition) {
            for (let i = oldPosition; i >= newPosition; i--) {
                this.tx.update(schema.queue)
                    .set({ position: i + 1 })
                    .where(eq(schema.queue.position, i))
                    .run();
            }
        } else {
            for (let i = oldPosition; i <= newPosition; i++) {
                this.tx.update(schema.queue)
                    .set({ position: i - 1 })
                    .where(eq(schema.queue.position, i))
                    .run();
            }
        }

        this.tx.update(schema.queue)
            .set({ position: newPosition })
            .where(eq(schema.queue.id, song.id))
            .run();
    }

    swapSong(queueId: number, song: NewSong): QueuedSong | undefined {
        this.tx.insert(schema.songs)
            .values(song)
            .onConflictDoUpdate({ set: song, target: schema.songs.url })
            .run();

        const queueEntry = this.tx.update(schema.queue)
            .set({ songUrl: song.url })
            .where(eq(schema.queue.id, queueId))
            .returning()
            .get();

        if (!queueEntry) return undefined;

        return {
            ...song,
            ...queueEntry,
        };
    }

    getActiveBySlug(slug: string): QueuedSong | undefined {
        return this.findOneByCondition(sql`${schema.queue.slug} = ${slug} AND ${schema.queue.dequeuedAt} IS NULL`);
    }

    enqueue(song: NewQueueSong): QueuedSong {
        this.tx.insert(schema.songs)
            .values(song)
            .onConflictDoUpdate({ set: song, target: schema.songs.url })
            .run();

        const queueEntry = this.tx
            .insert(schema.queue)
            .values({
                userId: song.userId,
                songUrl: song.url,
                position: sql`(SELECT COALESCE(MAX(position), -1) + 1 FROM ${schema.queue})`,
                slug: song.slug,
            })
            .returning()
            .get();

        const queuedSong = {
            ...song,
            ...queueEntry,
        };

        const position = this.scheduler.getPosition(this, queuedSong);
        if (position < 0 || position > queuedSong.position) {
            throw new Error('Invalid queue position');
        }

        // Move all songs at or after position down one
        this.tx.update(schema.queue)
            .set({ position: sql`${schema.queue.position} + 1` })
            .where(gte(schema.queue.position, position))
            .run();

        // Set position for new song
        this.tx.update(schema.queue)
            .set({ position })
            .where(eq(schema.queue.id, queueEntry.id))
            .run();

        this.events.emit('queue', queuedSong);
        return queuedSong;
    }

    dequeue(): QueuedSong | undefined {
        // Get song at pos 0
        const next = this.findOneByCondition(eq(schema.queue.position, 0));
        if (!next) {
            return undefined;
        }

        // Set dequeuedAt for song at pos 0
        this.tx.update(schema.queue)
            .set({ dequeuedAt: sql`(unixepoch())` })
            .where(eq(schema.queue.position, 0))
            .run();

        // Move all songs down one
        this.tx.update(schema.queue)
            .set({ position: sql`${schema.queue.position} - 1` })
            .run();

        this.events.emit('dequeue', next);
        return next;
    };

    getDurationUntilSong(song: QueuedSong): number {
        const result = this.tx
            .select({ duration: sql<number>`SUM(${schema.songs.duration})` })
            .from(schema.queue)
            .innerJoin(schema.songs, eq(schema.queue.songUrl, schema.songs.url))
            .where(and(
                lt(schema.queue.position, song.position),
                isNull(schema.queue.dequeuedAt),
            ))
            .get();

        return result?.duration ?? 0;
    }

    remove(queueId: number): void {
        const removed = this.tx.delete(schema.queue)
            .where(eq(schema.queue.id, queueId))
            .returning({ pos: schema.queue.position })
            .get();

        if (!removed) return;
        
        this.tx.update(schema.queue)
            .set({ position: sql`${schema.queue.position} - 1` })
            .where(gt(schema.queue.position, removed.pos))
            .run();
    }

    rollback(): never {
        this.tx.rollback();
    }
}

declare interface Queue {
    on(event: 'queue', listener: (song: QueuedSong) => void): this;
    on(event: 'dequeue', listener: (song: QueuedSong) => void): this;
}

class Queue extends EventEmitter {
    constructor(
        private db: Db,
        private scheduler: QueueScheduler = new FIFOQueueScheduler(),
    ) {
        super();
    }

    enqueue(song: NewQueueSong): QueuedSong {
        return this.transaction(tx => tx.enqueue(song));
    }

    swapSong(queueEntryId: number, newSong: NewSong): QueuedSong | undefined {
        return this.transaction(tx => tx.swapSong(queueEntryId, newSong));
    }

    dequeue(): QueuedSong | undefined {
        return this.transaction(tx => tx.dequeue());
    }

    findQueued(n: number, offset=0): QueuedSong[] {
        return this.transaction(tx => tx.findQueued(n, offset));
    }

    findById(id: number): QueuedSong | undefined {
        return this.transaction(tx => tx.findById(id));
    }

    findByUserId(userId: string): QueuedSong[] {
        return this.transaction(tx => tx.findByUserId(userId));
    }

    countQueued(): number {
        return this.transaction(tx => tx.countQueued());
    }

    countQueuedByUserId(userId: string): number {
        return this.transaction(tx => tx.countQueuedByUserId(userId));
    }

    getDurationUntilSong(song: QueuedSong): number {
        return this.transaction(tx => tx.getDurationUntilSong(song));
    }

    transaction<T>(callback: (tx: QueueTx) => T): T {
        return this.db.transaction(tx => {
            return callback(new QueueTx(tx, this, this.scheduler));
        });
    }
}

export default Queue;
