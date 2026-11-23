export interface SerialQueue {
  run<T>(fn: () => Promise<T>): Promise<T>;
  readonly busy: boolean;
}

export function createSerialQueue(): SerialQueue {
  let tail: Promise<unknown> = Promise.resolve();
  let pending = 0;
  return {
    run<T>(fn: () => Promise<T>): Promise<T> {
      pending += 1;
      const result = tail.then(fn, fn);
      const done = (): void => {
        pending -= 1;
      };
      tail = result.then(done, done);
      return result;
    },
    get busy(): boolean {
      return pending > 0;
    },
  };
}
