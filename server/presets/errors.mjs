export const MAX_DOCUMENT_BYTES = 1_048_576;
export const validKey = key => typeof key === 'string' && /^[A-Za-z0-9_-]{8,128}$/.test(key);

export class ServiceError extends Error {
  constructor(status, message, details = {}) {
    super(message);
    this.status = status;
    Object.assign(this, details);
  }
}

export const storageError = () => new ServiceError(503, 'Preset storage is unavailable. Retry after storage has recovered.');
