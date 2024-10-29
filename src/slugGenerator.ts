import { queue } from './schema';
import { sql } from 'drizzle-orm';
import type { QueueTx } from './queue';
import slugs from './slugs';

export default class SlugGenerator {
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

    private countActiveWithSlugPrefix(tx: QueueTx, slugPrefix: string): number {
        return tx.countByCondition(sql`
            ${queue.dequeuedAt} IS NULL AND (
                ${queue.slug} = ${slugPrefix} OR
                ${queue.slug} LIKE ${`${slugPrefix}-%`}
            );
        `);
    }
    
    nextSlug(tx: QueueTx): string {
        const index = this.chooseSlugIndex();
        const slug = this.slugs[index];
        const number = this.countActiveWithSlugPrefix(tx, slug);
        if (number === 0)
            return slug;
        return `${slug}-${number}`;
    }

    nextSlugAllowCollision(): string {
        const index = this.chooseSlugIndex();
        return this.slugs[index];
    }
};
