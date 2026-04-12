export function App(): JSX.Element {
  return (
    <main
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        background: 'linear-gradient(180deg, #e8f1ff 0%, #ffffff 100%)',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        color: '#0f4c9c',
        padding: '24px',
      }}
    >
      <h1 style={{ fontSize: '32px', margin: 0 }}>Ultimate Hockey</h1>
      <p style={{ fontSize: '16px', marginTop: '12px', color: '#4a6a8a' }}>
        Скоро в бою. Заглядывай позже.
      </p>
    </main>
  );
}
