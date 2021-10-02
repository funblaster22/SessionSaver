// TODO: is callbackfn return value typesafe?
export function mapAndFilter<T, U>(src: T[], callbackfn: (value: T, index: number, array) => U, thisArg?: any): U[] {
    const acc: U[] = [];
    src.forEach((val, index, array) => {
        const result = callbackfn(val, index, array);
        result && acc.push(result);
    }, thisArg);
    return acc;
}