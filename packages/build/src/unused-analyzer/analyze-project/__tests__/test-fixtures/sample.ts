export interface UsedInterface {
  usedProperty: string;
  unusedProperty?: number;
}

export interface UnusedInterface {
  someProperty: string;
}

export type UsedType = {
  usedField: string;
  unusedField?: boolean;
};

export type UnusedType = {
  field: string;
};

export function usedFunction(): void {
  console.log('used');
}

export function unusedFunction(): void {
  console.log('unused');
}

export const USED_CONSTANT = 'used';
export const UNUSED_CONSTANT = 'unused';

export class UsedClass {
  constructor(public name: string) {}
}

export class UnusedClass {
  constructor(public id: number) {}
}

export const usedVariable = 42;
export const unusedVariable = 99;
