import { createDefaultBarLayout, upgradeBarLayout, barLayoutErrors, type BarLayoutSnapshot } from '@hockey/game-core';
// Synthetic local preview only: no account, credentials or real API persistence.
export function installBarLayoutPreview() {
  const original = window.fetch.bind(window);
  const key = 'bar-layout-editor-demo-v1';
  const withLocalRoles = (snapshot: BarLayoutSnapshot): BarLayoutSnapshot => {
    if (!snapshot.layout.profiles.veronika.role.trim() ||
      snapshot.layout.profiles.veronika.role === 'Управляющая')
      snapshot.layout.profiles.veronika.role = 'Управляющая баром';
    const roles = {
      maria: 'Официантка',
      daria: 'Официантка',
      grigory: 'Заливщик льда',
      arsenich: 'Работник стадиона',
    } as const;
    const descriptions = {
      maria: ['Приглашает сыграть в карты. За столом замечает каждую ошибку.',
        'Общительная и наблюдательная. Любит подшутить, но всегда знает, когда стоит выслушать.'],
      daria: ['Составит компанию за карточным столом.',
        'Открытая и любопытная. Легко знакомится с людьми и не боится задавать вопросы.'],
      grigory: ['Любит карты и не упускает случая схитрить.',
        'Шустрый и хитрый, за словом в карман не лезет. Любит поддеть собеседника и проверить его на прочность.'],
      arsenich: ['Не торопится с ходом и бережёт козыри.',
        'Спокойный и рассудительный. Говорит прямо, замечает больше, чем показывает, и помогает без лишних слов.'],
    } as const;
    for (const id of Object.keys(roles) as (keyof typeof roles)[]) {
      if (!snapshot.layout.profiles[id].role.trim())
        snapshot.layout.profiles[id].role = roles[id];
      const profile = snapshot.layout.profiles[id];
      if (!profile.description.trim() || profile.description === descriptions[id][0])
        profile.description = descriptions[id][1];
    }
    return { ...snapshot, layout: upgradeBarLayout(snapshot.layout) };
  };
  const read = (): BarLayoutSnapshot => {
    try {
      const stored = localStorage.getItem(key);
      if (stored) {
        const snapshot = JSON.parse(stored) as BarLayoutSnapshot;
        if (
          Number.isInteger(snapshot.revision) &&
          snapshot.revision > 0 &&
          barLayoutErrors(snapshot.layout).length === 0
        )
          return withLocalRoles(snapshot);
      }
    } catch {
      /* Ignore invalid local demo data. */
    }
    return withLocalRoles({ revision: 1, layout: createDefaultBarLayout() });
  };
  window.fetch = async (input, init) => {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
      location.origin,
    );
    if (!url.pathname.endsWith('/bar/layout')) return original(input, init);
    if (init?.method === 'PUT' && url.pathname.endsWith('/admin/bar/layout')) {
      const payload = JSON.parse(String(init.body)) as BarLayoutSnapshot;
      if (
        payload.revision !== read().revision ||
        new URLSearchParams(location.search).get('bar-save') === 'conflict'
      )
        return Response.json(
          { error: { code: 'bar_layout_conflict', message: 'conflict' } },
          { status: 409 },
        );
      if (barLayoutErrors(payload.layout).length)
        return Response.json(
          { error: { code: 'bad_request', message: 'invalid' } },
          { status: 400 },
        );
      const snapshot = { ...payload, revision: payload.revision + 1 };
      localStorage.setItem(key, JSON.stringify(snapshot));
      return Response.json(snapshot);
    }
    return Response.json(read());
  };
}
