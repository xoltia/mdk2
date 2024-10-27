import { queue } from './schema';
import { sql } from 'drizzle-orm';
import type { QueueTx } from './queue';
import slugs from './slugs';

function shuffle(array: string[]): string[] {
    const shuffledArray = [...array];
    for (let i = shuffledArray.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffledArray[i], shuffledArray[j]] = [shuffledArray[j], shuffledArray[i]];
    }
    return shuffledArray;
}

export default class SlugGenerator {
    private readonly slugs: string[];
    private index = 0;
    
    constructor() {
        this.slugs = shuffle(slugs);
        this.slugs = this.slugs.filter(slug => slug.indexOf('-') === -1);
    }

    countActiveWithSlugPrefix(tx: QueueTx, slugPrefix: string): number {
        return tx.countByCondition(sql`
            ${queue.dequeuedAt} IS NULL AND (
                ${queue.slug} = ${slugPrefix} OR
                ${queue.slug} LIKE ${`${slugPrefix}-%`}
            );
        `);
    }
    
    nextSlug(tx: QueueTx): string {
        const slug = this.slugs[this.index];
        this.index = (this.index + 1) % this.slugs.length
        const number = this.countActiveWithSlugPrefix(tx, slug);
        if (number === 0)
            return slug;
        return `${slug}-${number}`;
    }
};
