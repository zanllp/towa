import { /* getConnectionManager,*/ createConnection, Connection, EntityManager, Repository, ObjectType, EntitySchema, FindOneOptions, ConnectionOptions } from 'typeorm';

export class DBFactory {
    constructor(typeORMOptions: ConnectionOptions) {
        this.typeORMOptions = typeORMOptions;
    }

    public connection: Connection;

    public typeORMOptions: ConnectionOptions ;

    public async GetConnection(): Promise<Connection> {
        const { typeORMOptions } = this;
        if (!this.connection) {
            this.connection = await createConnection(typeORMOptions);
        }
        return this.connection;
    }

    public async GetManager(): Promise<EntityManager> {
        return (await this.GetConnection()).manager;
    }

    public async GetRepository<Entity>(target: ObjectType<Entity> | EntitySchema<Entity> | string): Promise<Repository<Entity>> {
        const manager = await this.GetManager();
        return manager.getRepository(target);
    }

    public async findOneOrFail<Entity>(target: ObjectType<Entity> | EntitySchema<Entity>, where: number | FindOneOptions<Entity>) {
        const repo = await this.GetRepository(target);
        return repo.findOneOrFail(where as any);
    }

    public async findOne<Entity>(target: ObjectType<Entity> | EntitySchema<Entity>, where: number | FindOneOptions<Entity>) {
        const repo = await this.GetRepository(target);
        return repo.findOne(where as any);
    }
}
