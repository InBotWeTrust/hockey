import { AppError } from '../plugins/errors.js';

interface Queryable {
  query(sql: string, values?: unknown[]): Promise<unknown>;
}

export interface AndroidInstallationRegistration {
  token: string;
  appVersionCode: number;
}

export async function saveAndroidInstallation(
  db: Queryable,
  userId: string,
  installationId: string,
  registration: AndroidInstallationRegistration,
): Promise<void> {
  try {
    await db.query(
      `insert into android_push_installations
       (user_id, installation_id, fcm_token, platform, app_version_code)
       values ($1, $2, $3, 'android', $4)
       on conflict (user_id, installation_id) do update
       set fcm_token = excluded.fcm_token,
           app_version_code = excluded.app_version_code,
           updated_at = now(),
           last_error_at = null,
           disabled_at = null`,
      [userId, installationId, registration.token, registration.appVersionCode],
    );
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
      throw new AppError('fcm_token_in_use', 'FCM token belongs to another installation', 409);
    }
    throw error;
  }
}

export async function deleteAndroidInstallation(
  db: Queryable,
  userId: string,
  installationId: string,
): Promise<void> {
  await db.query(
    `delete from android_push_installations
      where user_id = $1 and installation_id = $2`,
    [userId, installationId],
  );
}
