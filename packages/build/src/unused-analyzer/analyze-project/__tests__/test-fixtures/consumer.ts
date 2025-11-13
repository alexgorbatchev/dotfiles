import { USED_CONSTANT, UsedClass, type UsedInterface, type UsedType, usedFunction, usedVariable } from './sample';

export function consumer(): void {
  usedFunction();
  console.log(USED_CONSTANT);

  const obj1: UsedInterface = {
    usedProperty: 'test',
  };

  const obj2: UsedType = {
    usedField: 'test',
  };

  console.log(obj1.usedProperty);
  console.log(obj2.usedField);

  const instance = new UsedClass('test');
  console.log(instance.name);

  console.log(usedVariable);
}
