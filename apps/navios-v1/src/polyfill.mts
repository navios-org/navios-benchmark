/**
 * Navios 1 keeps its metadata in `Symbol.metadata`, which no runtime has yet,
 * and tsc's decorators only fill it in when it is there. Has to be the first
 * import of an entry point. Navios 2 does not need it.
 */
;(Symbol as { metadata?: symbol }).metadata ??= Symbol('Symbol.metadata')
