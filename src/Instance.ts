import StoreControl from './StoreControl';
import { IEntity, ukType } from './type';

export class Instance<T, U extends IEntity> {
    constructor(uk: ukType<U>, store: StoreControl<T, U>) {
        this.uk = uk;
        this.store = store;
        this.redisKey = store.redisKey(uk);
    }

    public readonly store: StoreControl<T, U>;

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
        return this.store.getOrFail(this.uk);
    }

    public async setItems(items: Partial<{ [p in keyof T]: U[keyof U] }>) {
        const { store } = this;
        const redis = await store.getRedis();
        await this.checkExistAndLoad();
        let shouldRebuildIndex = false;
        const params = new Array<any>();
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
    }

    public async step(type: 'hincrby' | 'hincrbyfloat', key: keyof U, increment: number) {
        const { store } = this;
        const redis = await store.getRedis();
        await this.checkExistAndLoad();
        const res = await redis[type](this.redisKey, key as string, increment);
        if (store.indexFieldBlend.includes(key)) {
            await store.delIndex(this.uk);
            await store.buildIndex(this.uk);
        }
        await this.syncDB({ [key]: res });
        return res;
    }

    private async checkExistAndLoad() {
        return this.store.checkExistAndLoad(this.redisKey, this.uk);
    }

    private async syncDB(items: any) {
        const { uk, store } = this;
        const sync = () => store.getRepo().then(
            async repo => {
                const target = await this.store.findOneOrFail(this.store.uk2dbLoadParams(uk));
                for (const key in items) {
                    target[key] = items[key];
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
