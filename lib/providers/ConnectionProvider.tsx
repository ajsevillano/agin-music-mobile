import { createContext, useCallback, useMemo, useState } from 'react';
import { useNetworkState } from 'expo-network';

export type ServerStatus = 'unknown' | 'ok' | 'unreachable';

export type ConnectionContextType = {
    /** True when the device has network connectivity (Wi-Fi or cellular). */
    isOnline: boolean;
    /** Whether the Navidrome/OpenSubsonic server has answered our last call. */
    serverStatus: ServerStatus;
    /** Convenience flag: there is a problem reaching content from the server. */
    hasConnectionIssue: boolean;
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
    retryToken: 0,
    markServerOk: noop,
    markServerUnreachable: noop,
    retry: noop,
});

export default function ConnectionProvider({ children }: { children?: React.ReactNode }) {
    const network = useNetworkState();
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

    const value = useMemo<ConnectionContextType>(() => ({
        isOnline,
        serverStatus,
        hasConnectionIssue: !isOnline || serverStatus === 'unreachable',
        retryToken,
        markServerOk,
        markServerUnreachable,
        retry,
    }), [isOnline, serverStatus, retryToken, markServerOk, markServerUnreachable, retry]);

    return (
        <ConnectionContext.Provider value={value}>
            {children}
        </ConnectionContext.Provider>
    );
}
