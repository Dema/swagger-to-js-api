/* @flow */

declare module 'array-flatten' {
  declare module.exports: <T>(val: Array<Array<T>>) => Array<T>;
}
