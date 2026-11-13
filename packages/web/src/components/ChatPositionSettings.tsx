import './theme-settings.css';
import { setMapIconPosition, useMapIconPosition } from '../app/mapIconPosition.js';
import { SegmentedTabs } from './SegmentedTabs.js';

export function ChatPositionSettings({ owner }: { owner?: string | undefined }): JSX.Element {
  const position = useMapIconPosition(owner);
  return <section className="profile-theme-section" aria-label="Положение иконок на карте">
    <div className="section-label">Положение иконок на карте</div>
    <div className="glass profile-theme-settings profile-chat-position-settings">
      <SegmentedTabs items={[{id:'left',label:'Слева'},{id:'right',label:'Справа'}]}
        activeTab={position} ariaLabel="Положение иконок на карте"
        onChange={side => setMapIconPosition(owner, side)}/>
      <p>Выберите сторону для иконок занятий и сообщений на карте. Погода, если включена, будет на противоположной стороне.</p>
    </div>
  </section>;
}
