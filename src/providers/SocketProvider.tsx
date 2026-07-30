'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { io, Socket } from 'socket.io-client';

interface SocketContextValue {
  socket: Socket | null;
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
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [notificationCount, setNotificationCount] = useState(0);

  useEffect(() => {
    // Socket.io connection to the main server
    const s = io('/', {
      transports: ['polling', 'websocket'],
    });

    s.on('connect', () => {
      setConnected(true);
      s.emit('join', tenantId);
    });

    s.on('disconnect', () => setConnected(false));

    s.on('notification', (data: { count: number }) => {
      setNotificationCount(data.count);
    });

    s.on('card_updated', () => {
      window.dispatchEvent(new CustomEvent('board-refresh'));
    });

    setSocket(s);
    return () => { s.close(); };
  }, [tenantId]);

  return (
    <SocketContext.Provider value={{ socket, connected, notificationCount }}>
      {children}
    </SocketContext.Provider>
  );
}
