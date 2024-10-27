import { QueueTx, type QueuedSong } from './queue';

export interface QueueScheduler {
    getPosition(tx: QueueTx, song: QueuedSong): number;
}

export class FIFOQueueScheduler implements QueueScheduler {
    getPosition(_: QueueTx, song: QueuedSong): number {
        return song.position;
    }
}
