import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Clock } from 'lucide-react';
import { SESSION_LIMITS, getSessionStartMs } from '../lib/firebase';

/** Last activity time, shared by all CMS tabs in this browser so working in one keeps the others alive. */
export const LAST_ACTIVITY_KEY = 'za_cms_last_activity';
const WARNING_SECONDS = 60;
const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'wheel', 'touchstart', 'scroll'] as const;

export function markCmsActivity() {
  try {
    localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
  } catch {
    // storage unavailable (private mode etc.): the in-memory timer still works
  }
}

export function clearCmsActivity() {
  try {
    localStorage.removeItem(LAST_ACTIVITY_KEY);
  } catch {
    /* ignore */
  }
}

function readLastActivity(): number {
  try {
    return Number(localStorage.getItem(LAST_ACTIVITY_KEY)) || 0;
  } catch {
    return 0;
  }
}

interface Props {
  user: any;
  /** Called once when the session must end; the message explains why. */
  onExpire: (message: string) => void;
}

/**
 * Signs the CMS user out after SESSION_LIMITS.idleMinutes without activity (with a 60-second
 * warning) and after SESSION_LIMITS.maxSessionHours since they signed in, even if active.
 */
export const SessionGuard: React.FC<Props> = ({ user, onExpire }) => {
  const idleMs = SESSION_LIMITS.idleMinutes * 60_000;
  const maxMs = SESSION_LIMITS.maxSessionHours * 3_600_000;
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const localLast = useRef<number>(0);
  const sessionStart = useRef<number | null>(null);
  const expired = useRef(false);

  const expire = useCallback(
    (message: string) => {
      if (expired.current) return;
      expired.current = true;
      setSecondsLeft(null);
      onExpire(message);
    },
    [onExpire]
  );

  const touch = useCallback(() => {
    localLast.current = Date.now();
    markCmsActivity();
  }, []);

  useEffect(() => {
    expired.current = false;
    // Coming back to an open/restored session after a long absence
    const stored = readLastActivity();
    if (stored && Date.now() - stored >= idleMs) {
      expire(`You were signed out after ${SESSION_LIMITS.idleMinutes} minutes without activity.`);
      return;
    }
    touch();
    getSessionStartMs(user).then((ms) => {
      sessionStart.current = ms;
    });

    let lastWrite = 0;
    const onActivity = () => {
      const now = Date.now();
      if (now - lastWrite < 5000) return; // throttle storage writes
      lastWrite = now;
      touch();
    };
    ACTIVITY_EVENTS.forEach((ev) => window.addEventListener(ev, onActivity, { passive: true, capture: true }));

    const timer = window.setInterval(() => {
      const now = Date.now();
      if (sessionStart.current && now - sessionStart.current >= maxMs) {
        expire(`Your session reached the ${SESSION_LIMITS.maxSessionHours}-hour limit. Please sign in again.`);
        return;
      }
      const last = Math.max(localLast.current, readLastActivity());
      const idle = now - last;
      if (idle >= idleMs) {
        expire(`You were signed out after ${SESSION_LIMITS.idleMinutes} minutes without activity.`);
      } else if (idle >= idleMs - WARNING_SECONDS * 1000) {
        setSecondsLeft(Math.ceil((idleMs - idle) / 1000));
      } else {
        setSecondsLeft(null);
      }
    }, 1000);

    return () => {
      window.clearInterval(timer);
      ACTIVITY_EVENTS.forEach((ev) => window.removeEventListener(ev, onActivity, { capture: true } as any));
    };
  }, [user, idleMs, maxMs, expire, touch]);

  if (secondsLeft === null) return null;

  return (
    <div className="fixed inset-0 z-[70] bg-black/50 flex items-center justify-center p-4" role="alertdialog" aria-modal="true">
      <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 space-y-4 text-center">
        <Clock className="w-8 h-8 text-[#F37C1C] mx-auto" />
        <h2 className="text-base font-black text-slate-900">Are you still there?</h2>
        <p className="text-sm text-slate-600">
          For security you will be signed out in <strong className="font-mono">{secondsLeft}s</strong> because of inactivity.
        </p>
        <button
          type="button"
          autoFocus
          onClick={() => {
            touch();
            setSecondsLeft(null);
          }}
          className="w-full py-2.5 rounded-xl bg-[#1B8E44] hover:bg-[#147236] text-white font-bold text-sm"
        >
          Stay signed in
        </button>
      </div>
    </div>
  );
};
