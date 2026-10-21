import { MessageCircle, Newspaper } from 'lucide-react';
import { ChatExitLink } from './ChatExitLink.js';
import '../../components/navigation-geometry.css';
import './chat-section-dock.css';

interface Props {
  active: 'chat' | 'feed';
  chatUnread: number;
  feedUnread: number;
  onChange: (tab: 'chat' | 'feed') => void;
}

export function ChatSectionDock({ active, chatUnread, feedUnread, onChange }: Props): JSX.Element {
  return <nav className="chat-section-dock" aria-label="Разделы чата">
    <ChatExitLink/>
    {([
      { id: 'chat', label: 'Чат', Icon: MessageCircle, count: chatUnread },
      { id: 'feed', label: 'Лента', Icon: Newspaper, count: feedUnread },
    ] as const).map(({ id, label, Icon, count }) => <button key={id} type="button"
      className="chat-section-dock__item" aria-pressed={active === id}
      aria-label={count > 0 ? `${label}, непрочитанных: ${count}` : label} onClick={() => onChange(id)}>
      <span className="chat-section-dock__circle"><Icon size={22}/>
        {count > 0 && <span className="chat-section-dock__badge">{count > 99 ? '99+' : count}</span>}
      </span><span>{label}</span>
    </button>)}
  </nav>;
}
