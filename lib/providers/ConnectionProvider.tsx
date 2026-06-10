import { createContext, useCallback, useMemo, useState } from 'react';
import { useNetworkState } from 'expo-network';
import { useServer } from '@lib/hooks/useServer';

export type ServerStatus = 'unknown' | 'ok' | 'unreachable';

/** Where we're currently reaching the server from, for UI awareness. */
export type ConnectionMode = 'local' | 'remote' | 'offline' | 'unknown';

export type ConnectionContextType = {
    /** True when the device has network connectivity (Wi-Fi or cellular). */
    isOnline: boolean;
    /** Whether the Navidrome/OpenSubsonic server has answered our last call. */
    serverStatus: ServerStatus;
    /** Convenience flag: there is a problem reaching content from the server. */
    hasConnectionIssue: boolean;
    /** Coarse mode: reaching via local URL, remote URL, offline, or unknown. */
    connectionMode: ConnectionMode;
    /** Token that increments on retry(). Data consumers should depend on it to refetch. */
    retryToken: number;
    markServerOk: () => void;
    markServerUnreachable: () => void;
    /** Reset status to 'unknown' and bump retryToken so subscribers refetch. */
    retry: () => void;
}

const noop = () => { };

export const ConnectionContext = createContext<ConnectionContextType>({
    isOnline: true,
    serverStatus: 'unknown',
    hasConnectionIssue: false,
    connectionMode: 'unknown',
    retryToken: 0,
    markServerOk: noop,
    markServerUnreachable: noop,
    retry: noop,
});

export default function ConnectionProvider({ children }: { children?: React.ReactNode }) {
    const network = useNetworkState();
    const { connection } = useServer();
    const [serverStatus, setServerStatus] = useState<ServerStatus>('unknown');
    const [retryToken, setRetryToken] = useState(0);

    const isOnline = network.isConnected !== false && network.isInternetReachable !== false;

    const markServerOk = useCallback(() => {
        setServerStatus(prev => (prev === 'ok' ? prev : 'ok'));
    }, []);

    const markServerUnreachable = useCallback(() => {
        setServerStatus(prev => (prev === 'unreachable' ? prev : 'unreachable'));
    }, []);

    const retry = useCallback(() => {
        setServerStatus('unknown');
        setRetryToken(t => t + 1);
    }, []);

    const value = useMemo<ConnectionContextType>(() => {
        // The dual-URL probe is authoritative: it actually tried to reach the
        // server, so it trumps expo-network's isInternetReachable, which is
        // unreliable over a VPN/Tailscale (it often reports false even though the
        // server is perfectly reachable). Per-fetch markers (markServer*) only
        // drive the status in legacy single-URL mode (connection.reachable null).
        const probe = connection.reachable;

        const effectiveServerStatus: ServerStatus = connection.checking
            ? 'unknown'
            : probe === true
                ? 'ok'
                : probe === false
                    ? 'unreachable'
                    : serverStatus;

        const hasConnectionIssue = connection.checking
            ? false // don't flash an error while a probe is in flight
            : probe === true
                ? false // server answered the probe → we're connected, ignore isOnline
                : probe === false
                    ? true // neither URL answered
                    : !isOnline || serverStatus === 'unreachable';

        const connectionMode: ConnectionMode = hasConnectionIssue
            ? 'offline'
            : connection.source === 'local'
                ? 'local'
                : connection.source === 'remote'
                    ? 'remote'
                    : 'unknown';

        return {
            isOnline,
            serverStatus: effectiveServerStatus,
            hasConnectionIssue,
            connectionMode,
            retryToken,
            markServerOk,
            markServerUnreachable,
            retry,
        };
    }, [isOnline, serverStatus, connection.reachable, connection.checking, connection.source, retryToken, markServerOk, markServerUnreachable, retry]);

    return (
        <ConnectionContext.Provider value={value}>
            {children}
        </ConnectionContext.Provider>
    );
}
