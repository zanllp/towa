import { Redis } from 'ioredis';
import { DBFactory } from './DBFactory';
import StoreControl from './StoreControl';
import { runtimeCheck } from './Tool';
import { IConnectionParams, IEntity, IStoreControlInit } from './type';
import IORedis = require('ioredis');

export interface IBlendDB {
    typeorm: DBFactory;
    redis: Redis;
}

const connects: IBlendDB[] = new Array();
const connectParams: IConnectionParams[] = new Array();

export const createConnection = (connect: IConnectionParams) => {
    connectParams.push(connect);
    const index = connectParams.length - 1;
    return {
        storeControl: <T, U extends IEntity>(init: IStoreControlInit<T, U>) => {
            return new StoreControl(init, index);
        },
        getBlendDB: () => getBlendDB(index),
        storeControlORM: <U extends IEntity>(init: IStoreControlInit<U, U>) => {
            return new StoreControl({
                ...init,
                isORM: true,
            }, index);
        },
    };
};
export const getBlendDB = (index: number): IBlendDB => {
    if (!connects[index]) {
        runtimeCheck(connectParams[index], `索引错误 index:${index},Towa.connectParams.length:${connectParams.length},value:${connectParams[index]}`);
        connects[index] = {} as IBlendDB;
        connects[index].typeorm = new DBFactory(connectParams[index].typeorm);
        connects[index].redis = new IORedis(connectParams[index].redis);
    }
    return connects[index];
};
