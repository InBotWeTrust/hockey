import './theme-settings.css';
import { setMapChatPosition, useMapChatPosition } from '../app/mapChatPosition.js';
import { SegmentedTabs } from './SegmentedTabs.js';

export function ChatPositionSettings({ owner }: { owner?: string | undefined }): JSX.Element {
  const position = useMapChatPosition(owner);
  return <section className="profile-theme-section" aria-label="Положение чата">
    <div className="section-label">Положение чата</div>
    <div className="glass profile-theme-settings profile-chat-position-settings">
      <SegmentedTabs items={[{id:'left',label:'Слева'},{id:'right',label:'Справа'}]}
        activeTab={position} ariaLabel="Положение иконки чата"
        onChange={side => setMapChatPosition(owner, side)}/>
      <p>Над нижним меню. Когда меню свёрнуто, чат находится справа от него.</p>
    </div>
  </section>;
}
