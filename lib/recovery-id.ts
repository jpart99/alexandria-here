import { RecoveryIdCollisionError } from "./recovery-lease";

export const MAX_RECOVERY_ID_ATTEMPTS = 3;
const RECOVERY_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isRecoveryId(value: string): boolean {
  return RECOVERY_ID_PATTERN.test(value);
}

export async function allocateRecoveryId<T>(
  generateId: () => string,
  attempt: (recoveryId: string) => Promise<T>,
): Promise<{ recoveryId: string; value: T }> {
  let lastCollision: RecoveryIdCollisionError | undefined;
  for (let index = 0; index < MAX_RECOVERY_ID_ATTEMPTS; index += 1) {
    const recoveryId = generateId();
    try {
      return { recoveryId, value: await attempt(recoveryId) };
    } catch (error) {
      if (!(error instanceof RecoveryIdCollisionError)) throw error;
      lastCollision = error;
    }
  }
  throw lastCollision || new RecoveryIdCollisionError();
}
