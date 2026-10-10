export type ComputerOpponentId = 'daria' | 'maria' | 'grigory' | 'arsenich';
export const computerOpponents = [
  {
    id: 'daria',
    name: 'Дарья',
    difficulty: 'Легко',
    description:
      'Дарья только осваивает игру. Торопится, иногда тратит козыри зря и не всегда подкидывает.',
    win: '«Ого, хорошо играешь! Научишь меня?»',
    loss: '«Я выиграла! Давай ещё?»',
  },
  {
    id: 'grigory',
    name: 'Григорий',
    difficulty: 'С хитростью',
    description:
      'Григорий ходит быстро и подкидывает до последнего. Следи за картами: если подкинет неподходящую, нажми «Жульничаешь!» до своего ответа. Пойманный Григорий заберёт её обратно.',
    win: '«Ладно, твоя взяла. Но это случайность!»',
    loss: '«Ловкость рук! Ну что, ещё одну?»',
  },
  {
    id: 'maria',
    name: 'Мария',
    difficulty: 'Средне',
    description: 'Мария играет аккуратно: бережёт козыри и замечает твои ошибки.',
    win: '«Хорошо сыграно! Давай ещё одну?»',
    loss: '«В этот раз моя взяла. Давай попробуем ещё?»',
  },
  {
    id: 'arsenich',
    name: 'Арсенич',
    difficulty: 'Сложно',
    description:
      'Арсенич запоминает вышедшие карты, рассчитывает отбой и бережёт нужные козыри к концу партии.',
    win: '«Толково сыграл. Видно, что думал.»',
    loss: '«Не торопись с козырями. Сыграем ещё?»',
  },
] as const;
export const computerOpponent = (id?: string) =>
  computerOpponents.find((o) => o.id === id) ?? computerOpponents.find((o) => o.id === 'maria')!;
export const opponentArt = (id: ComputerOpponentId, variant: string) =>
  `/bar/cards/${id === 'maria' ? '' : `${id}-`}${variant}-${variant === 'avatar' ? 'v2' : 'v1'}.webp`;
