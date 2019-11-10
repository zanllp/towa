# towa
自动同步redis与mysql（typeorm）的node库，支持单索引多索引
# 例子
[towa-example](https://github.com/zanllp/towa-example)
# 安装
```
yarn add towa 或者 npm i towa
```
# 连接
```typescript
// app/store.ts
import { createConnection } from 'towa';
export const { storeControl, getBlendDB,storeControlORM } = createConnection({
    typeorm: {
        type: 'mysql',
        host: 'localhost',
        port: 3306,
        username: 'usr',
        password: 'pwd',
        database: 'db',
        charset: 'utf8mb4',
        synchronize: true,
        logging: false,
        entities: [ 'app/entity/*.ts' ],
        subscribers: [ 'app/subscriber/*.ts' ],
    },
    redis: {
        port: 6379, 
        host: '127.0.0.1', 
    },
});
```
支持多个连接,连接参数和[typeorm](https://github.com/typeorm/typeorm/blob/master/docs/zh_CN/connection-options.md)和[ioredis](https://github.com/luin/ioredis)一样
# 定义实体
## 使用orm的形式
```ts

import { storeControlORM } from '../store';
import { Type } from 'Towa';


export enum Permissions {
    admin = 'admin',
    dev = 'dev',
    user = 'user',
}

@Index([ 'account', 'email' ], { unique: true })
@Entity()
export class User {
    @Type(Number)
    @PrimaryGeneratedColumn()
    id: number;

    @Type(String)
    @Column({ length: 30 })
    account: string;

    @Type(String)
    @Column()
    password: string ;

    @Type(String)
    @Column({ length: 50 })
    email: string ;

    @Type(Boolean)
    @Column({ type: 'tinyint', default: 0 })
    enable: boolean;

    @Type(String)
    @Column({
        type: 'enum',
        enum: Permissions,
        default: Permissions.user,
    })
    group: Permissions;

    @Type(Date)
    @CreateDateColumn()
    createdDate: Date;

    @Type(Date)
    @UpdateDateColumn()
    updatedDate: Date;

    static store = storeControlORM({
        entity: User,
        indexField: [ 'email', 'account' ],
    });
}

```
## 定义返回类型及转换方法的形式
```typescript
// app/entity/document.ts
import { PrimaryGeneratedColumn, Entity, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { storeControl } from '../store';

export interface IDocumentRedis {
    id: number;
    authorId: number;
    content: string;
    title: string;
    createdDate: string;
    updatedDate: string;
}

@Index([ 'authorId' ])
@Entity()
export class Document {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    authorId: number;

    @Column()
    clickCount: number;

    @Column()
    title: string;

    @Column({ type: 'text' })
    content: string;

    @CreateDateColumn()
    createdDate: Date;

    @UpdateDateColumn()
    updatedDate: Date;

    static store = storeControl<IDocumentRedis, Document>({
        entity: Document,
        indexField: [ 'title' ],
        multiIndexField: [ 'authorId' ],
        convert: o => {
            o.id = Number(o.id);
            o.authorId = Number(o.authorId);
            return o;
        },
    });
}

```
# CRUD
```ts
// app/xx.ts
import { Document } from './document.ts'
const { store } = Document;
```
## create
```ts
const doc = new Document();
doc.authorId = user.id;
doc.title = 'hello world';
doc.content = '23333';
await store.push(doc);
```
## read
```ts
// 查询实体时，若存在于redis直接返回，反之先从typeorm加载到redis，再获取
const doc = await store.get(id); // 获取doc id为1的实体
const doc = await store.get('hello world', 'title'); // 使用索引获取,需要指定indexFiled
const docs = await store.get(authorId, 'authorId', -1) // 获取用户id为1下的所有doc
const inst = store.getInstance(id);
const doc = await inst.src();
```
## update
* 方法1，先从typeorm获取实体，可以用findOneOrFail也可以用store.getRepo()获取对应的存储库
```ts
const doc = await store.findOneOrFail(id);
doc.content += 'emmm';
await store.save(doc);
```
* 方法2，速度更快，因为除同步时外，不需要经过typeorm
```ts
const inst = store.getInstance(id);
await inst.setItems({   
    title: 'hello',
    content: 'world'
 });
await inst.step('hincrby', 'clickCount', 1); // clickCount++
```
## delete 
```ts 
await store.del(id);
```