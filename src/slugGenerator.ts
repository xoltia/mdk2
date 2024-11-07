import { queue } from './schema';
import { sql } from 'drizzle-orm';
import type { QueueTx } from './queue';
import slugs from './slugs.json' with { type: "json" };

export default class SlugGenerator {
    private readonly retryLimit = 5;
    private readonly slugs: string[];
    private readonly cdf: Float64Array;
    
    // higher bias -> more likely to choose the first slug
    constructor(bias: number = 0.5, slugFilter?: (slug: string) => boolean) {
        this.slugs = slugFilter ?
            slugs.filter(slugFilter) :
            slugs;
        this.cdf = new Float64Array(this.slugs.length);

        // PDF(i) = 1 / (i + 1) ** k
        // CDF(i) = sum((1 / (i + 1) ** k) for j in 0..i)
        const k = bias;
        let sum = 0;
        for (let i = 0; i < this.slugs.length; i++) {
            sum += 1 / Math.pow(i + 1, k);
            this.cdf[i] = sum;
        }
        for (let i = 0; i < this.cdf.length; i++) {
            this.cdf[i] /= sum;
        }
    }

    private chooseSlugIndex(): number {
        const rand = Math.random();
        for (let i = 0; i < this.cdf.length; i++) {
            if (rand < this.cdf[i])
                return i;
        }
        return this.cdf.length - 1;
    }

    private getSlugRepeatNumber(tx: QueueTx, slugPrefix: string): number {
        const lastSlug = tx.findOneByCondition(sql`
            ${queue.dequeuedAt} IS NULL AND (
                ${queue.slug} = ${slugPrefix} OR
                ${queue.slug} LIKE ${`${slugPrefix}-%`}
            )
            ORDER BY length(${queue.slug}) DESC, ${queue.slug} DESC
            LIMIT 1;
        `)?.slug;

        if (!lastSlug)
            return 0;

        if (lastSlug.includes('-'))
            return parseInt(lastSlug.split('-')[1]) + 1;

        return 1;
    }
    
    nextSlug(tx: QueueTx): string {
        let slug = this.slugs[this.chooseSlugIndex()];
        let sequenceNumber = this.getSlugRepeatNumber(tx, slug);
        let retry = 0;
        while (sequenceNumber > 0 && retry < this.retryLimit) {
            const nextSlug = this.slugs[this.chooseSlugIndex()];
            const nextSequenceNumber = this.getSlugRepeatNumber(tx, nextSlug);
            if (nextSequenceNumber < sequenceNumber) {
                slug = nextSlug;
                sequenceNumber = nextSequenceNumber;
            }
            retry++;
        }
        if (sequenceNumber === 0)
            return slug;
        return `${slug}-${sequenceNumber}`;
    }

    nextSlugAllowCollision(): string {
        const index = this.chooseSlugIndex();
        return this.slugs[index];
    }
};
