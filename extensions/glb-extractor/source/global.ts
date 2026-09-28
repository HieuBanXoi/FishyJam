export const PACKAGE_NAME = 'glb-extractor';

export function log(...arg: any[]) {
    return console.log(`[${PACKAGE_NAME}]`, ...arg);
}

export function warn(...arg: any[]) {
    return console.warn(`[${PACKAGE_NAME}]`, ...arg);
}
