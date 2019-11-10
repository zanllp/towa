import IORedis = require('ioredis');
import { ConnectionOptions } from 'typeorm';

export interface IEntity {
    id: number;
}

export interface IStoreControlInit<T, U extends IEntity> {
    /**
     * 数据来源
     */
    entity: new () => U;
    /**
     * 转换函数，每次获取数据后会调用
     */
    convert?: (src: T) => T;
    /**
     * 唯一键，需为实体的键,会作为redis key的一部分，默认实体的id
     */
    uniqueKey?: keyof U;
    /**
     * 索引字段，需为实体的键,为目标键建立索引,需要值唯一
     */
    indexField?: Array<keyof U>;
    /**
     * 多索引字段，需为实体的键,为目标键建立索引,需要键值可重复
     */
    multiIndexField?: Array<keyof U>;
    /**
     * 缓存字段，需为实体的键,若实现则缓存对应键值对,默认缓存全部，必须包含id，没有会帮你加上
     */
    cacheField?: Array<keyof U>;
    /**
     * 强制同步，true以阻塞的方式同步mysql和redis中的数据，false会已异步的方式同步mysql和redis中的数据
     */
    forceSync?: boolean;
    /**
     * 这里的orm单指redis，typeorm一直是orm
     */
    isORM?: boolean;
}
/**
 * 唯一键类型
 */
export type ukType<U> = string | number | U;

export interface IConnectionParams {
    redis?: IORedis.RedisOptions;
    typeorm: ConnectionOptions;
}
