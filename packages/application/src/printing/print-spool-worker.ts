import type { PrinterPort, PrintSpoolRepository } from "./printer-port";

const RETRY_SECONDS = [5, 15, 45, 120, 300, 900, 1800, 3600] as const;

export class PrintSpoolWorker {
  constructor(
    private readonly repository: PrintSpoolRepository,
    private readonly printer: PrinterPort,
    private readonly random: () => number = Math.random,
  ) {}

  async runOnce(
    workerId: string,
    now = new Date(),
  ): Promise<
    | { outcome: "idle" }
    | { outcome: "printed"; printJobId: string }
    | { outcome: "retry"; printJobId: string; retryAt: Date }
    | { outcome: "dead_letter"; printJobId: string }
  > {
    const job = await this.repository.claimNext(workerId, now);
    if (!job) return { outcome: "idle" };
    try {
      const receipt = await this.printer.print(job.document);
      await this.repository.markPrinted({
        printJobId: job.document.printJobId,
        attemptNumber: job.attemptNumber,
        adapterType: this.printer.adapterType,
        receipt,
      });
      return {
        outcome: "printed",
        printJobId: job.document.printJobId,
      };
    } catch (caught) {
      const error =
        caught instanceof Error ? caught.message : "unknown printer error";
      const deadLetter =
        job.attemptNumber >= job.maxAttempts ||
        job.attemptNumber >= RETRY_SECONDS.length;
      if (deadLetter) {
        await this.repository.markFailed({
          printJobId: job.document.printJobId,
          attemptNumber: job.attemptNumber,
          adapterType: this.printer.adapterType,
          error,
          deadLetter: true,
        });
        return {
          outcome: "dead_letter",
          printJobId: job.document.printJobId,
        };
      }
      const ceilingSeconds = RETRY_SECONDS[job.attemptNumber - 1] ?? 3600;
      const retryAt = new Date(
        now.getTime() + Math.max(1, this.random() * ceilingSeconds) * 1000,
      );
      await this.repository.markFailed({
        printJobId: job.document.printJobId,
        attemptNumber: job.attemptNumber,
        adapterType: this.printer.adapterType,
        error,
        retryAt,
        deadLetter: false,
      });
      return {
        outcome: "retry",
        printJobId: job.document.printJobId,
        retryAt,
      };
    }
  }
}
