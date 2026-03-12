export class WorkerPool {
  constructor(maxWorkers = 5) {
    this.maxWorkers = maxWorkers;

    this.running = false;

    this.activeWorkers = 0;

    this.workerId = 0;
  }

  start({ getNextItem, processItem }) {
    if (this.running) return;

    this.running = true;

    console.log(`🚀 Starting WorkerPool with ${this.maxWorkers} workers`);

    for (let i = 0; i < this.maxWorkers; i++) {
      this.spawnWorker(getNextItem, processItem);
    }
  }

  async spawnWorker(getNextItem, processItem) {
    const id = ++this.workerId;

    while (this.running) {
      try {
        const item = await getNextItem();

        if (!item) {
          await this.sleep(2000);
          continue;
        }

        this.activeWorkers++;

        const result = await processItem(item);

        this.activeWorkers--;

        console.log(`✅ Worker #${id} completed task`, result);
      } catch (err) {
        this.activeWorkers--;

        console.error(`❌ Worker #${id} error:`, err.message);

        await this.sleep(2000);
      }
    }
  }

  stop() {
    console.log("🛑 Stopping WorkerPool...");

    this.running = false;
  }

  getStatus() {
    return {
      running: this.running,
      maxWorkers: this.maxWorkers,
      activeWorkers: this.activeWorkers,
      idleWorkers: this.maxWorkers - this.activeWorkers,
    };
  }

  sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }
}