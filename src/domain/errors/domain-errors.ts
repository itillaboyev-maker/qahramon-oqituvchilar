export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DomainError";
  }
}

export class NotFoundError extends DomainError {
  constructor(entity: string, id: string) {
    super(`${entity} not found: ${id}`);
    this.name = "NotFoundError";
  }
}

export class ValidationError extends DomainError {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export class UnauthorizedActionError extends DomainError {
  constructor(message = "You are not allowed to perform this action") {
    super(message);
    this.name = "UnauthorizedActionError";
  }
}

export class RateLimitExceededError extends DomainError {
  constructor(message = "Too many submissions — please try again later") {
    super(message);
    this.name = "RateLimitExceededError";
  }
}
