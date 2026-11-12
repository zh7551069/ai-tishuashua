export class GenerationConfigValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GenerationConfigValidationError';
  }
}

export class GenerationConfigNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GenerationConfigNotFoundError';
  }
}
