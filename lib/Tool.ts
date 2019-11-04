export const check = (value: any, message?: string) => {
    if (!value) {
        throw new Error(message);
    }
};
