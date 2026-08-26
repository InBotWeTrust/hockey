export function tournamentStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    draft: 'Черновик',
    registration: 'Идёт регистрация',
    registration_blocked: 'Набор продлён',
    scheduling: 'Готовится расписание',
    regular: 'Регулярный чемпионат',
    playoff: 'Плей-офф',
    paused: 'Приостановлен',
    completed: 'Завершён',
    cancelled: 'Отменён',
    archived: 'В архиве',
  };
  return labels[status] ?? 'Статус уточняется';
}

export function participantStateLabel(state: string): string {
  const labels: Record<string, string> = {
    invited: 'Приглашён',
    applied: 'Заявка подана',
    approved: 'Участие подтверждено',
    rejected: 'Заявка отклонена',
    declined: 'Приглашение отклонено',
    withdrawn: 'Снялся с турнира',
    removed: 'Исключён',
    disqualified: 'Дисквалифицирован',
  };
  return labels[state] ?? 'Статус уточняется';
}

export function paymentStateLabel(state: string, coins: number): string {
  if (coins === 0 || state === 'not_required') return 'Без взноса';
  const labels: Record<string, string> = {
    pending: 'Ожидает оплаты',
    paid: 'Оплачен',
    refunded: 'Возвращён',
    failed: 'Ошибка оплаты',
  };
  return labels[state] ?? 'Статус оплаты уточняется';
}

export function russianPlural(value: number, one: string, few: string, many: string): string {
  const lastTwo = Math.abs(value) % 100;
  if (lastTwo >= 11 && lastTwo <= 14) return many;
  const last = Math.abs(value) % 10;
  if (last === 1) return one;
  if (last >= 2 && last <= 4) return few;
  return many;
}

export function participantsCountLabel(value: number): string {
  return `${value} ${russianPlural(value, 'участник', 'участника', 'участников')}`;
}
