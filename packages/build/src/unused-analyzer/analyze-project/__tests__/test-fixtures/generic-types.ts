// Test fixture for generic type parameter usage detection

// This interface is used as a generic type parameter, so it should NOT be reported as unused
export interface StepParams {
  hookType: string;
  hook: string;
}

// Base class that accepts a generic type parameter
export class BaseStep<TParams> {
  constructor(protected params: TParams) {}
}

// This class uses StepParams as a generic type parameter
export class ConcreteStep extends BaseStep<StepParams> {
  execute(): void {
    const { hookType, hook } = this.params;
    console.log(hookType, hook);
  }
}
