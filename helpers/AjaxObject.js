/* @flow */

export type AjaxObject = {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'OPTIONS' | 'DELETE',
  url: string,
  data?: any,
};
