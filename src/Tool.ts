export const runtimeCheck = (value: any, message?: string, errorType: new (_?: string) => Error = RuntimeCheckError) => {
    if (!value) {
        throw new errorType(message);
    }
};

export class RuntimeCheckError extends Error {
    public type = 1;
}
