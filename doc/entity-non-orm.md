
## 定义返回类型及转换方法的形式
```typescript
// app/entity/document.ts
import { PrimaryGeneratedColumn, Entity, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { storeControl } from '../store';
// 定义从redis取值再经过convert函数转换后的类型
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

    // 第一个泛型的类型是从redis取值后获得实例的类型，需要和convert返回的类型保持一致
    // 第二个泛型的类型从typeorm取值后获得实例的类型，和entity保持一致即可
    static store = storeControl<IDocumentRedis, Document>({
        entity: Document,
        indexField: [ 'title' ], 
        multiIndexField: [ 'authorId' ],
        // 每次从redis取值后都会进行的转换，若不进行转换取得的都是字符串类型
        convert: o => {
            o.id = Number(o.id);
            o.authorId = Number(o.authorId);
            return o;
        },
    });
}

```