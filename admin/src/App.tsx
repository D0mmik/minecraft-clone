import { useState, type FormEvent } from 'react';
import { useAdminSocket } from './useAdminSocket';

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h}h ${m}m ${s}s`;
}

function formatTime(t: number): string {
  const hours = Math.floor(t * 24);
  const minutes = Math.floor((t * 24 * 60) % 60);
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

export function App() {
  const { connected, authed, state, kick, ban, unban, sendChat } = useAdminSocket();
  const [chatInput, setChatInput] = useState('');
  const [banReason, setBanReason] = useState('');

  const params = new URLSearchParams(window.location.search);
  const hasKey = params.has('key');

  if (!hasKey) {
    return (
      <div className="container">
        <h1>Admin Console</h1>
        <p className="error">No key provided. Add ?key=YOUR_KEY to the URL.</p>
      </div>
    );
  }

  if (!connected) {
    return (
      <div className="container">
        <h1>Admin Console</h1>
        <p className="status connecting">Connecting...</p>
      </div>
    );
  }

  if (!authed) {
    return (
      <div className="container">
        <h1>Admin Console</h1>
        <p className="error">Authentication failed. Invalid key.</p>
      </div>
    );
  }

  const handleChat = (e: FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    sendChat(chatInput.trim());
    setChatInput('');
  };

  const handleBan = (username: string) => {
    ban(username, banReason || undefined);
    setBanReason('');
  };

  return (
    <div className="container">
      <h1>Admin Console</h1>
      <div className="status-bar">
        <span className="status online">Connected</span>
      </div>

      {state && (
        <>
          {/* Stats Panel */}
          <section className="panel">
            <h2>Server Stats</h2>
            <div className="stats-grid">
              <div className="stat">
                <span className="stat-label">Players</span>
                <span className="stat-value">{state.playerCount}</span>
              </div>
              <div className="stat">
                <span className="stat-label">Uptime</span>
                <span className="stat-value">{formatUptime(state.uptime)}</span>
              </div>
              <div className="stat">
                <span className="stat-label">Block Diffs</span>
                <span className="stat-value">{state.blockDiffsCount.toLocaleString()}</span>
              </div>
              <div className="stat">
                <span className="stat-label">Seed</span>
                <span className="stat-value">{state.seed}</span>
              </div>
              <div className="stat">
                <span className="stat-label">Time</span>
                <span className="stat-value">{formatTime(state.timeOfDay)}</span>
              </div>
            </div>
          </section>

          {/* Players */}
          <section className="panel">
            <h2>Players ({state.players.length})</h2>
            {state.players.length === 0 ? (
              <p className="empty">No players online</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Username</th>
                    <th>Position</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {state.players.map((p) => (
                    <tr key={p.id}>
                      <td>{p.username}</td>
                      <td className="mono">{Math.floor(p.x)}, {Math.floor(p.y)}, {Math.floor(p.z)}</td>
                      <td className="actions">
                        <button className="btn-kick" onClick={() => kick(p.username)}>Kick</button>
                        <button className="btn-ban" onClick={() => handleBan(p.username)}>Ban</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="ban-reason-row">
              <label>Ban reason:</label>
              <input
                type="text"
                value={banReason}
                onChange={(e) => setBanReason(e.target.value)}
                placeholder="Optional reason"
              />
            </div>
          </section>

          {/* Bans */}
          <section className="panel">
            <h2>Bans ({state.bans.length})</h2>
            {state.bans.length === 0 ? (
              <p className="empty">No bans</p>
            ) : (
              <ul className="ban-list">
                {state.bans.map((username) => (
                  <li key={username}>
                    <span>{username}</span>
                    <button className="btn-unban" onClick={() => unban(username)}>Unban</button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Chat */}
          <section className="panel">
            <h2>Admin Chat</h2>
            <form onSubmit={handleChat} className="chat-form">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Send message as [Admin]..."
                maxLength={200}
              />
              <button type="submit">Send</button>
            </form>
          </section>
        </>
      )}
    </div>
  );
}
