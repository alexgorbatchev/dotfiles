// Non-exported interface (internal type)
interface InternalDatabaseRow {
  id: number;
  name: string;
  created_at: Date;
  updated_at: Date;
}

export function getInternalRow(): InternalDatabaseRow {
  return {
    id: 1,
    name: 'test',
    created_at: new Date(),
    updated_at: new Date(),
  };
}

export function processInternalRow(row: InternalDatabaseRow): void {
  console.log(row.id, row.name);
  console.log(row.created_at, row.updated_at);
}

// Test destructuring pattern (like HookStepParams)
export interface DestructuredParams {
  hookType: string;
  hookName: string;
  enabled: boolean;
}

export class ParamProcessor {
  constructor(private params: DestructuredParams) {}

  process(): void {
    const { hookType, hookName, enabled } = this.params;
    console.log(hookType, hookName, enabled);
  }
}

export interface UserData {
  userId: number;
  userName: string;
}
