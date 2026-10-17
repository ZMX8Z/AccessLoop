export function hasMatchingOrigin(request: Request, applicationOrigin: string): boolean {
  return request.headers.get('Origin') === applicationOrigin
}
