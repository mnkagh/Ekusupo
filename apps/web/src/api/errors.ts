/** One reported fault inside an uploaded document, keyed by where it is. */
export interface ApiProblem {
  path: string;
  message: string;
}

/** A user-safe message from services/api, plus the HTTP status it came with. */
export class ApiError extends Error {
  readonly status: number;
  /**
   * Field-level faults, when the server sent them — a rejected UPF upload
   * reports every problem it found, and collapsing that into the single
   * `message` would turn one repair into as many round trips as there are
   * mistakes.
   */
  readonly problems: ApiProblem[];

  constructor(message: string, status: number, problems: ApiProblem[] = []) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.problems = problems;
  }
}
