export class ApiError extends Error {
  readonly status: number
  readonly fieldErrors?: Record<string, string>

  constructor(status: number, message: string, fieldErrors?: Record<string, string>) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.fieldErrors = fieldErrors
  }
}

export const forbidden = (msg = 'You do not have permission to perform this action.') => new ApiError(403, msg)
export const notFound = (msg = 'The requested record was not found.') => new ApiError(404, msg)
export const invalid = (msg: string, fieldErrors?: Record<string, string>) => new ApiError(422, msg, fieldErrors)
export const unauthenticated = () => new ApiError(401, 'Please sign in to continue.')

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  return 'Something went wrong. Please try again.'
}
