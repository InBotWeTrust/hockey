import type * as AmateurApi from '../api/amateurDuel.js';
import { updateAmateurDuelLoadout, submitAmateurDuelShot } from '../api/amateurDuel.js';
vi.mock('../api/amateurDuel.js', async (original) => ({
  ...(await original<typeof AmateurApi>()),
  updateAmateurDuelLoadout: vi.fn(),
  submitAmateurDuelShot: vi.fn(),
}));
import { afterEach, describe, it, expect, vi } from 'vitest';
import { useAmateurDuelStore } from './amateurDuelStore.js';
import type { AmateurDuelMatchState } from '../api/amateurDuel.js';
afterEach(() => {
  useAmateurDuelStore.setState({ match: null, inFlight: false });
  vi.clearAllMocks();
});
describe('fight authoritative revisions', () => {
  it('an older loadout response cannot replace a newer fight snapshot', async () => {
    const old = { id: 'match', state_revision: 1, fight: null } as unknown as AmateurDuelMatchState;
    const paused = {
      id: 'match',
      state_revision: 2,
      fight: { status: 'offered' },
    } as unknown as AmateurDuelMatchState;
    let resolve!: (value: { match: AmateurDuelMatchState }) => void;
    vi.mocked(updateAmateurDuelLoadout).mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    useAmateurDuelStore.setState({ match: old, inFlight: false });
    const request = useAmateurDuelStore.getState().updateLoadout({});
    useAmateurDuelStore.getState().applyState(paused);
    resolve({ match: old });
    await request;
    expect(useAmateurDuelStore.getState().match).toBe(paused);
  });
  it('old action response cannot remove a newer shared pause', () => {
    const current = {
      id: 'match',
      state_revision: 2,
      fight: { status: 'offered' },
    } as unknown as AmateurDuelMatchState;
    const old = { id: 'match', state_revision: 1, fight: null } as unknown as AmateurDuelMatchState;
    useAmateurDuelStore.setState({ match: current });
    useAmateurDuelStore.getState().applyState(old);
    expect(useAmateurDuelStore.getState().match).toBe(current);
  });
  it('a result revision supersedes a prior fight snapshot', () => {
    const current = {
      id: 'match',
      state_revision: 2,
      fight: { status: 'fighting' },
    } as unknown as AmateurDuelMatchState;
    const next = {
      id: 'match',
      state_revision: 3,
      fight: { status: 'resolved' },
    } as unknown as AmateurDuelMatchState;
    useAmateurDuelStore.setState({ match: current });
    useAmateurDuelStore.getState().applyState(next);
    expect(useAmateurDuelStore.getState().match).toBe(next);
  });
});

it('keeps a confirmed goal applicable when an opponent snapshot arrives during shot animation', async()=>{
 const current={id:'match',state_revision:2,status:'active',current_period_shots:1,current_period_goals:1,
 me:{state:'period_active',current_period:1,current_period_shots:1,shots_taken:1,goals:1,inventory_report:[]},
 opponent:{state:'period_active',current_period:1,current_period_shots:0,shots_taken:0}} as unknown as AmateurDuelMatchState;
 useAmateurDuelStore.setState({match:current});
 vi.mocked(submitAmateurDuelShot).mockResolvedValue({match_id:'match',server_result:'goal',confirmed_shot_index:1,state_revision:2,
 participant:{state:'period_active',current_period:1,current_period_shots:1,current_period_goals:1,shots_taken:1,goals:1},current_period_inventory:{periodNumber:1,consumed:[]},settled:false});
 const result=await useAmateurDuelStore.getState().submitShot({shotIndex:1,input:{tapTime:1000},claimedResult:'goal'});
 useAmateurDuelStore.getState().applyState({...current,opponent:{...current.opponent,shots_taken:1,current_period_shots:1}});
 expect(result?.isCurrent()).toBe(true);
 if(result)useAmateurDuelStore.getState().applyState(result.state);
 expect(useAmateurDuelStore.getState().match?.me.goals).toBe(1);
 expect(useAmateurDuelStore.getState().match?.opponent.shots_taken).toBe(1);
 useAmateurDuelStore.setState({match:{...current,current_period_shots:2}});
 expect(result?.isCurrent()).toBe(false);
 useAmateurDuelStore.setState({match:{...current,me:{...current.me,current_period:2}}});
 expect(result?.isCurrent()).toBe(false);
});
it('does not roll back a compact fight revision when applying a newer full match response',()=>{
 const current={id:'match',state_revision:2,fight:{id:'fight',revision:4,status:'fighting'}} as unknown as AmateurDuelMatchState;
 const old={...current,state_revision:3,fight:{...current.fight!,revision:3},current_period_goals:2};
 useAmateurDuelStore.setState({match:current});useAmateurDuelStore.getState().applyState(old);
 expect(useAmateurDuelStore.getState().match?.fight?.revision).toBe(4);
 expect(useAmateurDuelStore.getState().match?.current_period_goals).toBe(2);
});
