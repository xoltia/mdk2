import { QueueTx, type QueuedSong } from './queue';

export interface QueueScheduler {
    getPosition(tx: QueueTx, song: QueuedSong): number;
    onQueue?(song: QueuedSong): void;
    onDequeue?(song: QueuedSong): void;
}

export class FIFOQueueScheduler implements QueueScheduler {
    getPosition(_: QueueTx, song: QueuedSong): number {
        return song.position;
    }
}
