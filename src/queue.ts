import { type Db } from "./db";
import * as schema from "./schema";
import { and, count, eq, gte, isNull, SQL, sql } from "drizzle-orm";
import { EventEmitter } from "events";
import { FIFOQueueScheduler, type QueueScheduler } from "./sheduler";

export type QueuedSong = typeof schema.songs.$inferSelect & Omit<typeof schema.queue.$inferSelect, 'songUrl'>;
export type NewSong = typeof schema.songs.$inferInsert & { userId: string };
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

    findQueued(n: number): QueuedSong[] {
        const rows = this.tx
            .select()
            .from(schema.queue)
            .innerJoin(schema.songs, eq(schema.queue.songUrl, schema.songs.url))
            .where(gte(schema.queue.position, 0))
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

    countQueuedByUserId(userId: string): number {
        const result = this.tx
            .select({ count: count() })
            .from(schema.queue)
            .where(and(eq(schema.queue.userId, userId), isNull(schema.queue.dequeuedAt)))
            .get();

        return result?.count ?? 0;
    }

    enqueue(song: NewSong): QueuedSong {
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
        if (this.scheduler.onQueue) this.on('queue', this.scheduler.onQueue);
        if (this.scheduler.onDequeue) this.on('dequeue', this.scheduler.onDequeue);
    }

    async enqueue(song: NewSong): Promise<QueuedSong> {
        return this.transaction(tx => tx.enqueue(song));
    }

    async dequeue(): Promise<QueuedSong | undefined> {
        return this.transaction(tx => tx.dequeue());
    }

    async transaction<T>(callback: (tx: QueueTx) => T): Promise<T> {
        return this.db.transaction(tx => {
            return callback(new QueueTx(tx, this, this.scheduler));
        });
    }
}

export default Queue;
