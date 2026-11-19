// SuiteScript AMD loader, provided by NetSuite at runtime.
declare function define(deps: string[], factory: (...modules: any[]) => any): void;

// N/log is loaded by default in every SuiteScript 2.x script; it is used without importing it.
declare const log: typeof import('N/log');
