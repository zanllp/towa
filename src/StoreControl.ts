import { FindOneOptions } from 'typeorm';
import { getBlendDB } from './Connect';
import { Instance } from './Instance';
import { runtimeCheck } from './Tool';
import { IEntity, IStoreControlInit, ukType } from './type';
import { isNumber } from 'util';

export default class StoreControl<T, U extends IEntity> {

    constructor(init: IStoreControlInit<T, U>, connectionIndex: number) {
        const { convert, uniqueKey, entity, indexField, cacheField, multiIndexField, forceSync, isORM } = init;
        this.isORM = isORM === undefined ? false : isORM;
        this.forceSync = forceSync === undefined ? false : forceSync;
        this.uniqueKey = uniqueKey || this.uniqueKey;
        this.redisKey = (o: ukType<U>) => `${this.entity.name}:${this.ukfn(o)}`;
        this.redisAllKey = `${entity.name}All`;
        this.entity = entity;
        this.convert = convert;
        if (uniqueKey) {
            this.dbLoad = k => ({
                where: {
                    [this.uniqueKey]: (typeof k === 'number' || typeof k === 'string') ? k : k[this.uniqueKey],
                },
            });
        }
        this.cacheField = cacheField || [];
        this.indexField = indexField || [];
        this.mutliIndexField = multiIndexField || [];
        this.indexFieldBlend = [...this.indexField, ...this.mutliIndexField];
        this.indexField.forEach(x => this.indexKey[x] = (o: U[keyof U]) => `${entity.name}-${x}:${o}`);
        this.mutliIndexField.forEach(x => this.mutliIndexKey[x] = (o: U[keyof U]) => `${entity.name}-${x}:${o}`);
        if (this.cacheField.length) {
            if (!this.cacheField.includes('id')) {
                this.cacheField.push('id');
            }
            this.indexFieldBlend.forEach(x => runtimeCheck(this.cacheField.includes(x), `(多)索引字段${x}不存在于缓存字段中`));
        }
        this.connectionIndex = connectionIndex;
    }

    /**
     * 在Towa中存放的链接索引
     */
    public connectionIndex: number;

    /**
     * 实体，对应表
     */
    public entity: new () => U;

    /**
     * 唯一键
     */
    public redisKey: (uk: ukType<U>) => string;

    /**
     * 保存整个队列的键
     */
    public redisAllKey: string;

    /**
     * 唯一标识，不可变
     */
    public uniqueKey: keyof U = 'id';

    /**
     * redis与mysql的同步方式，true会在修改redis立马修改mysql，false异步修改mysql
     */
    public forceSync: boolean;

    /**
     * 每次获取后的转换函数
     */
    public convert: ((src: T) => T) | undefined;

    /**
     * 找不到对应键时，从typeorm加载的函数
     */
    public dbLoad: ((o: ukType<U>) => FindOneOptions<U>) | undefined;

    /**
     * 索引字段，1对1，字符串实现
     */
    public indexField: Array<keyof U>;

    /**
     * 多索引字段，多对1，集合实现
     */
    public mutliIndexField: Array<keyof U>;

    /**
     * 两种索引的混合
     */
    public indexFieldBlend: Array<keyof U>;

    /**
     * 索引生成函数，indexKey[field] 返回对应函数
     */
    public indexKey: Partial<{ [P in keyof U]: (i: U[keyof U]) => string; }> = {};

    /**
     * 多索引生成函数，mutliIndexKey[field] 返回对应函数
     */
    public mutliIndexKey: Partial<{ [P in keyof U]: (i: U[keyof U]) => string; }> = {};

    /**
     * 指定缓存字段，默认所有，必须包含id，没有会帮你加上
     */
    public cacheField: Array<keyof U>;

    private isORM: boolean;

    // tslint:disable-next-line:ban-types
    private ormType: Partial<{ [p in keyof T]: Function }> = {};

    /**
     * 转换成uk
     */
    public ukfn: (uk: ukType<U>) => string = o => `${((typeof o === 'string') || (typeof o === 'number')) ? o : o[this.uniqueKey]}`;

    public getBlendDB() {
        return getBlendDB(this.connectionIndex);
    }

    public getRedis() {
        return this.getBlendDB().redis;
    }

    public async getRepo() {
        return this.getBlendDB().typeorm.GetRepository(this.entity);
    }

    /**
     * 使用typeorm查找一个实体,失败直接抛异常
     * @param where 查找参数
     */
    public async findOneOrFail(where: number | FindOneOptions<U>) {
        return this.getRepo().then(repo => repo.findOneOrFail(where as any));
    }

    /**
     * 使用typeorm查找一个实体,失败直接抛异常
     * @param where 查找参数
     */
    public async findOne(where: number | FindOneOptions<U>) {
        return this.getRepo().then(repo => repo.findOne(where as any));
    }

    /**
     * 将实体的唯一键转换成数据库加载实体的参数
     * @param uk 唯一键
     */
    public uk2dbLoadParams(uk: ukType<U>) {
        if (this.dbLoad) { // 字符串只可能出现在dbload
            return this.dbLoad(uk); // 如果不是用id拿来当key，则需要调用dbload
        } else {
            if (uk instanceof Object) {
                return uk.id;
            } else {
                const id = Number(uk);
                runtimeCheck(isNumber(id), `uk:${uk}`);
                return id;
            }
        }
    }

    public async indexArray(stop = -1, start = 0) {
        const redis = await this.getRedis();
        const allKey = this.redisAllKey;
        if (!await redis.exists(allKey)) {
            const repo = await this.getRepo();
            const allEntity = await repo.find();
            for (const x of allEntity) {
                await this.save2redis(x);
            }
            const uks = allEntity.map(x => x[this.uniqueKey]);
            if (uks.length) {
                redis.lpush(allKey, ...uks as any);
            }
        }
        const ids = await redis.lrange(allKey, start, stop); // -1是直到结束
        return ids as string[];
    }

    /**
     * 通过多索引获取
     * @param value 索引值
     * @param field 索引的字段，或者叫键
     * @param count 获取数量，-1或者大于数量时获取全部
     * @param start 开始位置
     */
    public async get(value: U[keyof U], field: keyof U, count: number, start?: number): Promise<T[] | null>;
    /**
     * 通过索引获取
     * @param value 索引值
     * @param field 索引的字段，或者叫键
     */
    public async get(value: U[keyof U], field: keyof U): Promise<T | null>;
    /**
     * 通过唯一键获取
     * @param uk uniqueKey唯一键
     */
    public async get(uk: ukType<U>): Promise<T | null>;
    public async get(a: any, b?: any, c?: any, d?: any): Promise<T | T[] | null> {
        try {
            return await this.getOrFail(a, b, c, d);
        } catch (error) {
            return null;
        }
    }

    /**
     * 通过多索引获取
     * @param value 索引值
     * @param field 索引的字段，或者叫键
     * @param count 获取数量，-1或者大于数量时获取全部
     * @param start 开始位置
     */
    public async getOrFail(value: U[keyof U], field: keyof U, count: number, start?: number): Promise<T[]>;
    /**
     * 通过索引获取
     * @param value 索引值
     * @param field 索引的字段，或者叫键
     */
    public async getOrFail(value: U[keyof U], field: keyof U): Promise<T>;
    /**
     * 通过唯一键获取
     * @param uk uniqueKey唯一键
     */
    public async getOrFail(uk: ukType<U>): Promise<T>;
    public async getOrFail(a: any, b?: any, c?: any, start = 0): Promise<T | T[]> {
        const { indexKey, mutliIndexKey } = this;
        const redis = await this.getRedis();
        if (c === undefined) {
            let uk: ukType<U>;
            if (b === undefined) {
                uk = a;
            } else {
                const field = b as keyof U;
                const value = a as U[keyof U];
                const indexKeyFunc = indexKey[field]!;
                runtimeCheck(indexKeyFunc, `索引${field}不存在`);
                const iKey = indexKeyFunc(value); // 索引键
                await this.checkExistAndLoad(iKey, value, field);
                uk = await redis.get(iKey) as string; // 肯定是字符串，找不到的话在上面就抛异常了
            }
            const key = this.redisKey(uk);
            await this.checkExistAndLoad(key, uk);
            const res = await redis.hgetall(key);
            return this.redisSourceConvert(res as any);
        } else {
            const field = b as keyof U;
            const value = a as U[keyof U];
            let count = c as number;
            count = count < -1 ? -1 : count;
            const indexKeyFunc = mutliIndexKey[field]!;
            runtimeCheck(indexKeyFunc, `多索引${field}不存在`);
            const key = indexKeyFunc(value);
            await this.checkExistAndLoad(key, value, field, true);
            let uks: string[] = await redis.smembers(key);
            uks.reverse(); // smember的取出顺序和lrange是相反的，为了保持一致反转下
            if (uks.length > count && count !== -1) {
                uks = uks.slice(start, start + count);
            }
            const res = await Promise.all(uks.map(x => this.getOrFail(x)));
            return res.map(x => this.redisSourceConvert(x as any));
        }
    }

    public redisSourceConvert(res: { [p in keyof T]: string }) {
        const { isORM, ormType } = this;
        if (isORM) {
            Object.keys(res).forEach(key => {
                let type = ormType[key];
                if (type === undefined) {
                    type = Reflect.getMetadata('design:type', this.entity.prototype, key);
                    runtimeCheck(type, `${this.entity.name}的键${key}没有加Type装饰器`);
                    ormType[key] = type;
                }
                switch (type) {
                    case String:
                        return;
                    case Boolean: // mysql的布尔用的tinyint
                        type = (x: string) => isNaN(x as any) ? (x === 'true' || false) : Boolean(Number(x));
                        ormType[key] = type;
                        break;
                    case Date:
                        type = (x: string) => new Date(x);
                        ormType[key] = type;
                        break;
                    default:
                }
                res[key] = type!(res[key]);
            });
            return res as any;
        } else {
            return this.convert ? this.convert(res as any) : res;
        }
    }

    /**
     * 通过多索引获取对应实例就行下一步操作
     * @param value 索引值
     * @param field 索引的字段，或者叫键
     * @param count 获取数量，-1或者大于数量时获取全部
     * @param start 开始位置
     */
    public async getInstance(value: U[keyof U], field: keyof U, count: number, start?: number): Promise<Array<Instance<T, U>>>;
    /**
     * 通过索引获取对应实例就行下一步操作
     * @param value 索引值
     * @param field 索引的字段，或者叫键
     */
    public async getInstance(value: U[keyof U], field: keyof U): Promise<Instance<T, U>>;
    /**
     * 通过唯一键获取对应实例就行下一步操作
     * @param uk uniqueKey唯一键
     */
    public async getInstance(uk: ukType<U>): Promise<Instance<T, U>>;
    public async getInstance(a: any, b?: any, c?: any, start = 0): Promise<Instance<T, U> | Array<Instance<T, U>>> {
        const { indexKey, mutliIndexKey } = this;
        const redis = await this.getRedis();
        if (c === undefined) {
            let uk: ukType<U>;
            if (!b) {
                uk = a;
            } else {
                const field = b as keyof U;
                const value = a as U[keyof U];
                const indexKeyFunc = indexKey[field]!;
                runtimeCheck(indexKeyFunc, `索引${field}不存在`);
                const key = indexKeyFunc(value);
                await this.checkExistAndLoad(key, value, field, true);
                uk = await redis.get(key) as string;
            }
            return new Instance(uk, this);
        } else {
            const field = b as keyof U;
            const value = a as U[keyof U];
            let count = c as number;
            count = count < -1 ? -1 : count;
            const indexKeyFunc = mutliIndexKey[field]!;
            runtimeCheck(indexKeyFunc, `多索引${field}不存在`);
            const key = indexKeyFunc(value);
            await this.checkExistAndLoad(key, value, field, true);
            let uks: string[] = await redis.smembers(key);
            uks.reverse();
            if (uks.length > count && count !== -1) {
                uks = uks.slice(start, start + count);
            }
            return uks.map(uk => new Instance(uk, this));
        }
    }

    public async all() {
        return this.range();
    }

    public async range(stop = -1, start = 0) {
        const ids = await this.indexArray(stop, start);
        return this.uks2Eneity(ids);
    }

    /**
     * 检查是否存在于redis中，如果没有则加载，找不到抛异常
     * @param key 目标键
     * @param 其它参数为不存在时的加载参数
     */
    public async checkExistAndLoad(key: string, value: U[keyof U], field: keyof U, loadAll?: boolean): Promise<void>;

    /**
     * 检查是否存在于redis中，如果没有则加载，找不到抛异常
     * @param key 目标键
     * @param 其它参数为不存在时的加载参数
     */
    public async checkExistAndLoad(key: string, uk: ukType<U>): Promise<void>;
    public async checkExistAndLoad(key: string, a: any, b?: any, c?: any) {
        const redis = await this.getRedis();
        if (!await redis.exists(key)) {
            await this.load(a, b, c);
        }
    }

    public async load(value: U[keyof U], field: keyof U, loadAll?: boolean): Promise<void>;
    public async load(uk: ukType<U>): Promise<void>;
    public async load(a: any, b?: any, c?: any) {
        let target: U;
        if (!b) {
            const uk = a as ukType<U>;
            target = await this.findOneOrFail(this.uk2dbLoadParams(uk));
            await this.save2redis(target);
        } else {
            const value = a as U[keyof U];
            const field = b as keyof U;
            const loadAll = c as boolean;
            if (loadAll) {
                const repo = await this.getRepo();
                const all = await repo.find({ where: { [field]: value } });
                // runtimeCheck(all.length > 0, `找不到对应实体k:${field} v:${value}`);
                await Promise.all(all.map(x => this.save2redis(x)));
            } else {
                target = await this.findOneOrFail({ where: { [field]: value } });
                await this.save2redis(target);
            }
        }
    }

    public async buildIndex(uk: ukType<U>) {
        const { indexField, indexKey, mutliIndexField, mutliIndexKey } = this;
        if (indexField.length === 0 && mutliIndexField.length === 0) {
            return;
        }
        const redis = await this.getRedis();
        let t: U;
        if (typeof uk === 'number' || typeof uk === 'string') {
            t = await this.get(uk) as any;
        } else {
            t = uk;
        }
        for (const i of indexField) { // 建立索引
            await redis.set(indexKey[i]!(t[i]), t[this.uniqueKey] as any);
        }
        for (const i of mutliIndexField) {
            await redis.sadd(mutliIndexKey[i]!(t[i]), t[this.uniqueKey] as any);
        }
    }

    public async delIndex(uk: ukType<U>) {
        const { indexField, indexKey, mutliIndexKey, mutliIndexField } = this;
        const redis = await this.getRedis();
        const willDelKey = new Array<string>();
        if (indexField.length !== 0 || mutliIndexField.length !== 0) {
            if (await redis.exists(this.redisKey(uk))) {// 如果不存在这个键，可以认为所对应的索引也不存在，不需要删除
                const target = await this.get(uk) as any;
                indexField.forEach(x => willDelKey.push(indexKey[x]!(target[x])));
                for (const i of mutliIndexField) {
                    const fn = mutliIndexKey[i]!;
                    const key = fn(target[i]);
                    await redis.srem(key, target[this.uniqueKey]);
                    if (await redis.scard(key) === 0) {
                        willDelKey.push(key);
                    }
                }
            }
        }
        if (willDelKey.length) {
            await redis.del(...willDelKey);
        }
    }

    /**
     * 删除实例
     * @param uk 唯一标识
     * @param syncOnce 是否同步执行这个操作一次（默认mysql的修改是异步，所以可能会出错，可以用这个来防止）
     */
    public async del(uk: ukType<U>, syncOnce = false) {
        const redis = await this.getRedis();
        await this.delIndex(uk);
        await redis.del(this.redisKey(uk));
        await redis.lrem(this.redisAllKey, 0, uk as any);
        const sync = async () => this.getRepo().then(repo => this.findOneOrFail(this.uk2dbLoadParams(uk)).then(x => repo.remove(x)));
        if (this.forceSync || syncOnce) {
            await sync();
        } else {
            sync(); // warn:删除后可能会依旧找得到，因为是异步
        }
    }

    /**
     * 保存修改的实例
     * @param target 修改后的实例
     * @param syncOnce 是否同步执行这个操作一次（默认mysql的修改是异步，所以可能会出错，可以用这个来防止）
     */
    public async save(target: U, syncOnce = false) {
        runtimeCheck(!(this.uniqueKey === 'id' && target.id === undefined), '这个实体的唯一键字段是id，且target.id === undefined，说明这个实体是新的，需要使用push，而不是save');
        await this.delIndex(target);
        await this.save2redis(target);
        const sync = async () => this.getRepo().then(repo => repo.save(target as any));
        if (this.forceSync || syncOnce) {
            await sync();
        } else {
            sync(); // warn:保存后修改可能时可能会会找不到，因为是异步
        }
    }

    /**
     * 加入新的实例
     * @param target 新实例
     */
    public async push(target: U) {
        const redis = await this.getRedis();
        const repo = await this.getRepo();
        await repo.save(target as any);
        await this.save2redis(target);
        if (!await redis.exists(this.redisAllKey)) {
            await this.range(); // 这里仅为了加载这张表到redis而已
        } else {
            await redis.lpush(this.redisAllKey, this.ukfn(target));
        }
    }

    protected async uks2Eneity(uks: Array<ukType<U>>) {
        return Promise.all(uks.map(x => this.getOrFail(x)));
    }

    private async save2redis(target: U) {
        const key = this.redisKey(target);
        const { cacheField } = this;
        const redis = await this.getRedis();
        if (cacheField.length) {
            const args = new Array<string>();
            cacheField.forEach(k => args.push(k as any, target[k] as any));
            await redis.hmset(key, ...args);
        } else {
            await redis.hmset(key, target);
        }
        await this.buildIndex(target);
    }
}
