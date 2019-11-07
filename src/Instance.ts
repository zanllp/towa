import StoreControl from './StoreControl';
import { IEntity, ukType } from './type';

export class Instance<T, U extends IEntity> {
    constructor(uk: ukType<U>, store: StoreControl<T, U>) {
        this.uk = uk;
        this.store = store;
        this.redisKey = store.redisKey(uk);
    }

    public readonly store: StoreControl<T, U>;

    private data: T | undefined;

    public redisKey: string;

    public readonly uk: ukType<U>;

    public async src() {
        try {
            return await this.srcOrFail();
        } catch (error) {
            return null;
        }
    }

    public async srcOrFail() {
        if (this.data === undefined) {
            this.data = await this.store.getOrFail(this.uk);
        }
        return this.data;
    }

    public async setItems(items: Partial<{ [p in keyof T]: U[keyof U] }>) {
        const { store } = this;
        const redis = await store.getRedis();
        await this.checkExist();
        let shouldRebuildIndex = false;
        const params = new Array<any>();
        // tslint:disable-next-line: forin
        for (const key in items) {
            if (!shouldRebuildIndex && store.indexFieldBlend.includes(key as keyof U)) {
                shouldRebuildIndex = true;
            }
            params.push(key as string, items[key]);
        }
        await redis.hmset(this.redisKey, ...params);
        if (shouldRebuildIndex) {
            await store.delIndex(this.uk);
            await store.buildIndex(this.uk);
        }
        await this.syncDB(items);
        this.data = undefined;
    }

    public async step(type: 'hincrby' | 'hincrbyfloat', key: keyof U, increment: number) {
        const { store } = this;
        const redis = await store.getRedis();
        await this.checkExist();
        const res = await redis[type](this.redisKey, key as string, increment);
        if (store.indexFieldBlend.includes(key)) {
            await store.delIndex(this.uk);
            await store.buildIndex(this.uk);
        }
        await this.syncDB({ [key]: res });
        this.data = undefined;
        return res;
    }

    private async checkExist() {
        const { store } = this;
        const redis = await store.getRedis();
        if (!await redis.exists(this.redisKey)) {
            await store.load(this.uk);
        }
    }

    public async syncDB(items: any) {
        const { uk, store } = this;
        const sync = () => store.getRepo().then(
            async repo => {
                const target = await this.store.findOneOrFail(this.store.uk2dbLoadParams(uk));
                // tslint:disable-next-line: forin
                for (const key in items) {
                    (target as any)[key] = items[key];
                }
                await repo.save(target as any);
            });
        if (store.forceSync) {
            await sync();
        } else {
            sync();
        }
    }
}
