import { RecoveryIdCollisionError } from "./recovery-lease";

export const MAX_RECOVERY_ID_ATTEMPTS = 3;

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
