/* @flow */

export default class AjaxPipe<In, Out> {
  constructor(obj: In): AjaxPipe<In, Out> & In {
    // $FlowIgnore.
    Object.assign(this, obj);
    return ((this: any): AjaxPipe<In, Out> & In);
  }

  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  url: string;
  data: any;

  pipeThrough = async (fn: Function): Promise<{ data: Out, status: number }> =>
    await fn(this);
}
