export class TransportError extends Error {
 constructor(public readonly code:'network'|'disconnected'|'cancelled'){super(code);}
}
