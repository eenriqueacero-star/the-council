import React, { useState } from 'react';
import { Moon, Sun, Bell, BellOff, BellRing } from 'lucide-react';
import { theme } from '../utils/theme.js';
import { requestPermission, getPermissionState } from '../utils/notify.js';

const FONT  = { fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', sans-serif" };
const MFONT = { fontFamily: "ui-monospace, 'SF Mono', monospace" };

const THRESHOLDS = [3, 5, 7, 10];

export default function SettingsTab({ dark, setDark, alertSettings, setAlertSettings }) {
  const T = theme(dark);
  const [notifPerm, setNotifPerm] = useState(() => getPermissionState());

  const row = { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px' };
  const section = { border: `1px solid ${T.border}`, borderRadius: 12, overflow: 'hidden', marginBottom: 20 };
  const sectionHeader = { padding: '10px 16px', background: T.bgCard, borderBottom: `1px solid ${T.border}` };

  async function enableNotifs() {
    const result = await requestPermission();
    setNotifPerm(result);
  }

  const NotifIcon = notifPerm === 'granted' ? BellRing : notifPerm === 'denied' ? BellOff : Bell;
  const notifColor = notifPerm === 'granted' ? '#38e0d4' : notifPerm === 'denied' ? '#FF3B30' : T.text2;
  const notifLabel = notifPerm === 'granted' ? 'On' : notifPerm === 'denied' ? 'Blocked by browser' : 'Off';

  return (
    <div style={{ ...FONT, maxWidth: 480, margin: '0 auto', padding: '24px 16px' }}>
      <h2 style={{ fontSize: 22, fontWeight: 700, color: T.text, marginBottom: 24, letterSpacing: '-0.01em' }}>Settings</h2>

      {/* Appearance */}
      <div style={section}>
        <div style={row}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {dark ? <Moon size={18} style={{ color: T.text2 }} /> : <Sun size={18} style={{ color: T.text2 }} />}
            <div>
              <div style={{ fontSize: 15, fontWeight: 500, color: T.text }}>Dark mode</div>
              <div style={{ fontSize: 13, color: T.text2, marginTop: 2 }}>Switch between light and dark appearance</div>
            </div>
          </div>
          <button onClick={() => setDark(d => !d)} style={{
            width: 50, height: 30, borderRadius: 15, border: 'none', cursor: 'pointer',
            background: dark ? '#000000' : '#E0E0E0', position: 'relative', flexShrink: 0,
            transition: 'background 0.2s ease',
          }} aria-label="Toggle dark mode">
            <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#FFFFFF', position: 'absolute', top: 3, left: dark ? 23 : 3, transition: 'left 0.2s ease', boxShadow: '0 1px 4px rgba(0,0,0,0.25)' }} />
          </button>
        </div>
      </div>

      {/* Portfolio Alerts */}
      <div style={section}>
        <div style={sectionHeader}>
          <span style={{ ...MFONT, fontSize: 10, color: T.text3, letterSpacing: '0.1em' }}>PORTFOLIO ALERTS</span>
        </div>

        {/* Notification permission */}
        <div style={{ ...row, borderBottom: `1px solid ${T.border}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <NotifIcon size={18} style={{ color: notifColor }} />
            <div>
              <div style={{ fontSize: 15, fontWeight: 500, color: T.text }}>Notifications</div>
              <div style={{ fontSize: 13, color: notifColor, marginTop: 2 }}>{notifLabel}</div>
            </div>
          </div>
          {notifPerm !== 'granted' && notifPerm !== 'denied' && (
            <button onClick={enableNotifs} style={{ ...MFONT, fontSize: 12, fontWeight: 600, padding: '7px 14px', borderRadius: 8, border: 'none', background: '#38e0d4', color: '#000', cursor: 'pointer' }}>
              Enable
            </button>
          )}
        </div>

        {/* Global threshold */}
        <div style={{ padding: '14px 16px', borderBottom: `1px solid ${T.border}` }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: T.text, marginBottom: 10 }}>Alert threshold (default for all holdings)</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {THRESHOLDS.map(t => (
              <button
                key={t}
                onClick={() => setAlertSettings(prev => ({ ...prev, globalThreshold: t }))}
                style={{
                  ...MFONT, fontSize: 12, fontWeight: 600, padding: '6px 14px', borderRadius: 8,
                  border: `1px solid ${alertSettings?.globalThreshold === t ? '#38e0d4' : T.border}`,
                  background: alertSettings?.globalThreshold === t ? 'rgba(56,224,212,0.15)' : 'transparent',
                  color: alertSettings?.globalThreshold === t ? '#38e0d4' : T.text2,
                  cursor: 'pointer',
                }}
              >
                {t}%
              </button>
            ))}
          </div>
        </div>

        <div style={{ padding: '12px 16px' }}>
          <div style={{ fontSize: 12, color: T.text3, lineHeight: 1.6 }}>
            Alerts fire when a holding moves by the threshold (up or down) compared to previous close. Once per stock per day.
          </div>
          <div style={{ ...MFONT, fontSize: 11, color: T.text3, marginTop: 10 }}>
            📱 Add to Home Screen on iOS (Safari → Share → Add to Home Screen) for push notifications
          </div>
        </div>
      </div>

      <p style={{ ...MFONT, fontSize: 11, color: T.text3, marginTop: 24, textAlign: 'center', letterSpacing: '0.06em' }}>
        THE COUNCIL · NOT FINANCIAL ADVICE
      </p>
    </div>
  );
}
