export class AnonymousSessionRequired extends Error {
  constructor() { super('Initialize an anonymous session before continuing.') }
}
