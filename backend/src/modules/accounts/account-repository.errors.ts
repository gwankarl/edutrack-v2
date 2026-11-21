export class AccountEmailAlreadyExistsError extends Error {
  constructor() {
    super('An account with this email already exists.');
    this.name = 'AccountEmailAlreadyExistsError';
  }
}

export class EmailVerificationIssuanceLimitError extends Error {
  constructor() {
    super('Email verification issuance limit reached.');
    this.name = 'EmailVerificationIssuanceLimitError';
  }
}

export class PasswordResetIssuanceLimitError extends Error {
  constructor() {
    super('Password reset issuance limit reached.');
    this.name = 'PasswordResetIssuanceLimitError';
  }
}
