'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

interface SocketContextValue {
  socket: null;
  connected: boolean;
  notificationCount: number;
}

const SocketContext = createContext<SocketContextValue>({
  socket: null,
  connected: false,
  notificationCount: 0,
});

export function useSocket() {
  return useContext(SocketContext);
}

export default function SocketProvider({ children, tenantId }: { children: ReactNode; tenantId: string }) {
  const [connected, setConnected] = useState(false);
  const [notificationCount, setNotificationCount] = useState(0);

  useEffect(() => {
    // Connect to native Server-Sent Events endpoint to prevent socket.io 404 polling flood
    if (typeof window === 'undefined') return;

    let eventSource: EventSource | null = null;
    try {
      const url = tenantId ? `/api/events?tenantId=${encodeURIComponent(tenantId)}` : '/api/events';
      eventSource = new EventSource(url);

      eventSource.onopen = () => {
        setConnected(true);
      };

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'notification' && typeof data.count === 'number') {
            setNotificationCount(data.count);
          }
          if (data.type === 'card_updated' || data.type === 'refresh') {
            window.dispatchEvent(new CustomEvent('board-refresh'));
          }
        } catch {}
      };

      eventSource.onerror = () => {
        setConnected(false);
      };
    } catch {
      setConnected(false);
    }

    return () => {
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [tenantId]);

  return (
    <SocketContext.Provider value={{ socket: null, connected, notificationCount }}>
      {children}
    </SocketContext.Provider>
  );
}
