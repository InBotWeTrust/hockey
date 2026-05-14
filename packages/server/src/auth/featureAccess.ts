interface Queryable {
  query<T>(text: string, values?: readonly unknown[]): Promise<{ rows: T[] }>;
}

const EXPERIMENTAL_TRAINING_COURT_VK_IDS = ['600725087'] as const;
const EXPERIMENTAL_TRAINING_COURT_TELEGRAM_IDS = ['8579300717', '8704117510'] as const;

export async function canUseExperimentalTrainingCourt(
  db: Queryable,
  user: { id: string; role: 'player' | 'admin' },
): Promise<boolean> {
  if (user.role === 'admin') return true;

  const { rows } = await db.query<{ allowed: boolean }>(
    `select exists(
       select 1
         from auth_providers
        where user_id = $1
          and (
            (provider = 'vk' and provider_uid = any($2::text[]))
            or (provider = 'telegram' and provider_uid = any($3::text[]))
          )
     ) as allowed`,
    [
      user.id,
      [...EXPERIMENTAL_TRAINING_COURT_VK_IDS],
      [...EXPERIMENTAL_TRAINING_COURT_TELEGRAM_IDS],
    ],
  );

  return rows[0]?.allowed === true;
}
