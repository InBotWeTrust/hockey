import { Component, type ReactNode } from 'react';
interface Props { children: ReactNode; reload?: () => void }
/** A deployment can remove a chunk an older tab has never requested. Let the user recover. */
export class ChunkLoadBoundary extends Component<Props, {error: Error | null}> {
  override state: {error: Error | null} = {error:null};
  static getDerivedStateFromError(error: Error) { return {error}; }
  override render(): ReactNode {
    const error = this.state.error;
    if (!error) return this.props.children;
    if (!/dynamically imported module|Importing a module script failed|Loading (?:CSS )?chunk|Unable to preload CSS/i.test(error.message)) throw error;
    return <div className="modal-backdrop" role="alertdialog" aria-modal="true" aria-label="Обновление приложения">
      <div className="modal-card">
        <h2 className="modal-title">Не удалось загрузить экран</h2>
        <p className="modal-copy">Проверьте соединение и обновите приложение.</p>
        <div className="modal-actions"><button className="modal-primary btn--cta" onClick={()=>this.props.reload ? this.props.reload() : window.location.reload()}>Обновить приложение</button></div>
      </div>
    </div>;
  }
}
