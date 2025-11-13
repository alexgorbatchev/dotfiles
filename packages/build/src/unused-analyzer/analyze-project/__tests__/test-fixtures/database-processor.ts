import type { UserData } from './database-types';

export function processUserData(data: UserData): void {
  console.log(data.userId, data.userName);
}
