export interface WorkerTask<TInput, TOutput> {
  run: (input: TInput) => Promise<TOutput>;
}

export function createWorkerTask<TInput, TOutput>(workerFactory: () => Worker): WorkerTask<TInput, TOutput> {
  return {
    run: (input: TInput) => {
      return new Promise((resolve, reject) => {
        const worker = workerFactory();
        
        worker.onmessage = (e: MessageEvent) => {
          if (e.data.error) {
            reject(new Error(e.data.error));
          } else {
            resolve(e.data.result);
          }
          worker.terminate();
        };
        
        worker.onerror = (e: ErrorEvent) => {
          reject(e);
          worker.terminate();
        };
        
        worker.postMessage(input);
      });
    }
  };
}
