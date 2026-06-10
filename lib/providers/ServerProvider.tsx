import axios from 'axios';
import { createContext, useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useNetworkState, NetworkStateType } from 'expo-network';
import { fixUrl, generateSubsonicToken } from '@lib/util';
import { BaseResponse, DiscoverServerResult, OpenSubsonicExtensions } from '@lib/types';
import config from '../constants/config';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type Server = {
    /** Resolved, active base URL all consumers use. */
    url: string;
    /** Optional LAN address, tried first when both are set. */
    localUrl?: string;
    /** Optional remote address (e.g. Tailscale), used when the local one is unreachable. */
    remoteUrl?: string;
    authMethod: '' | 'openid' | 'apiKey' | 'saltedPassword' | 'password';
    auth: {
        username?: string;
        password?: string;
        apiKey?: string;
    };
    version: string;
    extensions: OpenSubsonicExtensions[];
};

/** Which of the configured URLs is currently active. */
export type ActiveUrlSource = 'single' | 'local' | 'remote' | 'none';

export type ConnectionInfo = {
    /** The URL currently in use. */
    activeUrl: string;
    /** Where the active URL came from. */
    source: ActiveUrlSource;
    /** True while a reachability probe is running. */
    checking: boolean;
    /**
     * Authoritative result of the last probe: true/false when a probe ran,
     * null in legacy single-URL mode where data fetches drive the status.
     */
    reachable: boolean | null;
};

/**
 * Local addresses (LAN) answer in milliseconds when you're home; when you're
 * away they're unroutable and just hang, so keep this short.
 */
const LOCAL_PROBE_TIMEOUT = 2500;

/**
 * Remote addresses (e.g. a Tailscale `.ts.net` host) can be slow on the first
 * hit over cellular: MagicDNS + WireGuard + TLS cold start. Give them room so a
 * reachable remote isn't wrongly flagged offline.
 */
const REMOTE_PROBE_TIMEOUT = 7000;

/** Debounce for the network-change re-probe: a single Wi-Fi -> cellular switch
 * emits several expo-network updates in quick succession; coalesce them so we
 * don't keep superseding an in-flight probe before it can finish. */
const NETWORK_CHANGE_DEBOUNCE = 600;

/** How often to re-probe while foregrounded, to catch VPN/network transitions. */
const REPROBE_INTERVAL = 15000;

export type ServerAuth = {
    salt?: string;
    hash?: string;
}

export const initialServer: Server = {
    url: '',
    authMethod: '',
    auth: {

    },
    version: '',
    extensions: [],
}

export type ServerContextType = {
    server: Server;
    serverAuth: ServerAuth;
    connection: ConnectionInfo;
    discoverServer: (url: string) => Promise<DiscoverServerResult> | void;
    saveAndTestPasswordCredentials: (username: string, password: string, serverOverride?: string, authMethodOverride?: Server['authMethod']) => Promise<boolean>;
    /** Persist the local/remote URL pair; an empty string clears that slot. */
    setServerUrls: (localUrl: string, remoteUrl: string) => void;
    /** Re-run the local-first reachability probe and switch the active URL. */
    recheckConnection: () => void;
    isLoading: boolean;
    logOut: () => Promise<void>;
}

const initialServerContext: ServerContextType = {
    server: initialServer,
    serverAuth: {},
    connection: { activeUrl: '', source: 'none', checking: false, reachable: null },
    discoverServer: () => { },
    saveAndTestPasswordCredentials: async () => { return false; },
    setServerUrls: () => { },
    recheckConnection: () => { },
    isLoading: true,
    logOut: async () => { },
}

/** Build Subsonic auth params for a bare ping, mirroring useSubsonicParams. */
function buildPingParams(server: Server, serverAuth: ServerAuth) {
    if (!server.auth.username) return null;
    const base = {
        c: `${config.clientName}/${config.clientVersion}`,
        f: 'json',
        v: config.protocolVersion,
        u: server.auth.username,
    };
    if (server.authMethod === 'password') {
        if (!server.auth.password) return null;
        return { ...base, p: server.auth.password };
    }
    if (!serverAuth.hash || !serverAuth.salt) return null;
    return { ...base, t: serverAuth.hash, s: serverAuth.salt };
}

/** True if the URL answers /rest/ping within the timeout with a Subsonic response. */
async function pingUrl(url: string, params: Record<string, string>, timeout: number): Promise<boolean> {
    try {
        const res = await axios.get(`${url}/rest/ping`, { params, timeout });
        const status = res.data?.['subsonic-response']?.status;
        return status === 'ok' || status === 'failed';
    } catch {
        return false;
    }
}

export const ServerContext = createContext<ServerContextType>(initialServerContext);

export default function ServerProvider({ children }: { children?: React.ReactNode }) {
    const [server, setServer] = useState<Server>(initialServer);
    const [serverAuth, setServerAuth] = useState<ServerAuth>({});
    const [isLoading, setIsLoading] = useState(true);
    const [connection, setConnection] = useState<ConnectionInfo>({ activeUrl: '', source: 'none', checking: false, reachable: null });

    const network = useNetworkState();

    // Always-fresh values for use inside listeners/probes without re-subscribing.
    const serverRef = useRef(server);
    const serverAuthRef = useRef(serverAuth);
    const networkRef = useRef(network);
    serverRef.current = server;
    serverAuthRef.current = serverAuth;
    networkRef.current = network;

    // Increments on each resolve so a slow probe can't override a newer result.
    const resolveIdRef = useRef(0);

    // Only update connection state when something actually changed, so the
    // periodic re-probe doesn't churn renders while the status is stable.
    const setConnectionIfChanged = useCallback((next: ConnectionInfo) => {
        setConnection(prev =>
            prev.activeUrl === next.activeUrl && prev.source === next.source
                && prev.checking === next.checking && prev.reachable === next.reachable
                ? prev : next);
    }, []);

    const applyActiveUrl = useCallback((url: string, source: ActiveUrlSource, reachable: boolean | null) => {
        setServer(prev => (prev.url === url ? prev : { ...prev, url }));
        setConnectionIfChanged({ activeUrl: url, source, checking: false, reachable });
    }, [setConnectionIfChanged]);

    // silent: background re-probes (network change / foreground / polling) skip
    // the "checking" flash so the UI doesn't flicker every cycle.
    const resolveAndApply = useCallback(async (silent = false) => {
        const runId = ++resolveIdRef.current;
        const s = serverRef.current;
        const local = s.localUrl?.trim() || '';
        const remote = s.remoteUrl?.trim() || '';

        // Legacy single-URL setup: no probe, let data fetches drive the status.
        if (!local && !remote) {
            setConnectionIfChanged({ activeUrl: s.url, source: s.url ? 'single' : 'none', checking: false, reachable: null });
            return;
        }

        const params = buildPingParams(s, serverAuthRef.current);
        if (!params) {
            // No credentials to probe yet — adopt the preferred (local) URL optimistically.
            const url = local || remote;
            return applyActiveUrl(url, local ? 'local' : 'remote', null);
        }

        if (!silent) setConnection(c => ({ ...c, checking: true }));

        // Probe both URLs in parallel. Sequentially, a dead local address (a
        // 192.168.x.x host just hangs until timeout when you're on cellular)
        // would burn its whole timeout before the remote one is even tried, and
        // a burst of network-change events could supersede the run before it got
        // there. Firing both at once keeps the worst case at one timeout, while
        // awaiting local first preserves "prefer local when both answer".
        const localProbe = local ? pingUrl(local, params, LOCAL_PROBE_TIMEOUT) : Promise.resolve(false);
        const remoteProbe = remote ? pingUrl(remote, params, REMOTE_PROBE_TIMEOUT) : Promise.resolve(false);

        if (local) {
            const localOk = await localProbe;
            if (runId !== resolveIdRef.current) return; // superseded by a newer resolve
            if (localOk) return applyActiveUrl(local, 'local', true);
        }
        if (remote) {
            const remoteOk = await remoteProbe;
            if (runId !== resolveIdRef.current) return; // superseded by a newer resolve
            if (remoteOk) return applyActiveUrl(remote, 'remote', true);
        }

        // Nothing reachable: flag the outage on the address that's most likely
        // relevant. When we're away (not on Wi-Fi/Ethernet) show the remote one,
        // so the failure message doesn't keep pointing at the unreachable LAN IP.
        const netType = networkRef.current?.type;
        const onLan = netType === NetworkStateType.WIFI || netType === NetworkStateType.ETHERNET;
        if (!onLan && remote) applyActiveUrl(remote, 'remote', false);
        else if (local) applyActiveUrl(local, 'local', false);
        else applyActiveUrl(remote, 'remote', false);
    }, [applyActiveUrl, setConnectionIfChanged]);

    useEffect(() => {
        if (server.url == '') return;
        (async () => {
            try {
                if (server?.auth?.password) {
                    await SecureStore.setItemAsync('password', server.auth.password);
                }

                const { auth, ...rest } = server || {};
                const serverObject = { ...rest, auth: { ...auth, password: undefined, apiKey: undefined } };

                await AsyncStorage.setItem('server', JSON.stringify(serverObject));
            } catch (error) {
                console.error('Error saving server data:', error);
            }
        })();
    }, [server]);

    useEffect(() => {
        (async () => {
            try {
                let updatedServer = { ...initialServer };

                const serverStored = await AsyncStorage.getItem('server');
                if (serverStored) {
                    const serverInfo = JSON.parse(serverStored);
                    updatedServer = { ...updatedServer, ...serverInfo };
                }

                const storedPassword = await SecureStore.getItemAsync('password');
                if (storedPassword) {
                    updatedServer.auth = { ...updatedServer.auth, password: storedPassword };
                }

                setServer(updatedServer);

                setIsLoading(false);
            } catch (error) {
                console.error('Error loading server data:', error);
            }
        })();
    }, []);

    useEffect(() => {
        (async () => {
            if (!server.auth.password) return;
            if (server.authMethod === 'password') return;
            const { salt, hash } = await generateSubsonicToken(server.auth.password);
            setServerAuth({ salt, hash });
        })();
    }, [server.auth.password, server.authMethod]);

    // Visible re-resolve on the initial load and when the config/credentials change.
    useEffect(() => {
        if (isLoading) return;
        resolveAndApply(false);
    }, [isLoading, server.localUrl, server.remoteUrl, server.auth.username, server.auth.password, server.authMethod, serverAuth.hash, serverAuth.salt, resolveAndApply]);

    // Silent re-probe when the reported network changes (e.g. Wi-Fi -> cellular).
    // Debounced because a single switch emits a burst of expo-network updates;
    // coalescing them avoids restarting (and superseding) the probe repeatedly.
    useEffect(() => {
        if (isLoading) return;
        const t = setTimeout(() => resolveAndApply(true), NETWORK_CHANGE_DEBOUNCE);
        return () => clearTimeout(t);
    }, [isLoading, network.isConnected, network.isInternetReachable, network.type, resolveAndApply]);

    // Foreground + periodic safety net. Network-type changes are not reported
    // when a VPN (Tailscale) goes up/down on the same underlying network, so we
    // also re-probe on a timer while the app is in the foreground to catch
    // Wi-Fi <-> VPN <-> cellular transitions.
    useEffect(() => {
        if (isLoading) return;
        let interval: ReturnType<typeof setInterval> | null = null;
        const startPolling = () => {
            if (!interval) interval = setInterval(() => resolveAndApply(true), REPROBE_INTERVAL);
        };
        const stopPolling = () => {
            if (interval) { clearInterval(interval); interval = null; }
        };
        const sub = AppState.addEventListener('change', state => {
            if (state === 'active') { resolveAndApply(true); startPolling(); }
            else stopPolling();
        });
        if (AppState.currentState === 'active') startPolling();
        return () => { stopPolling(); sub.remove(); };
    }, [isLoading, resolveAndApply]);

    const setServerUrls = useCallback((localUrl: string, remoteUrl: string) => {
        const normLocal = localUrl.trim() ? fixUrl(localUrl.trim()) : '';
        const normRemote = remoteUrl.trim() ? fixUrl(remoteUrl.trim()) : '';
        setServer(prev => ({ ...prev, localUrl: normLocal, remoteUrl: normRemote }));
    }, []);

    const recheckConnection = useCallback(() => {
        resolveAndApply(false);
    }, [resolveAndApply]);

    const discoverServer = useCallback(async (url: string): Promise<DiscoverServerResult> => {
        let correctUrl = '';
        let authMethod: Server['authMethod'] = '';
        try {
            correctUrl = fixUrl(url);

            const rawRes = await axios.get(`${correctUrl}/rest/getOpenSubsonicExtensions`, {
                params: {
                    c: `${config.clientName}/${config.clientVersion}`,
                    f: 'json',
                    v: config.protocolVersion,
                }
            });

            const res = rawRes.data['subsonic-response'] as (BaseResponse & { openSubsonicExtensions: OpenSubsonicExtensions[] });

            if (res.status != 'ok' && res.status != 'failed') {
                if (res.status == 'failed') {
                    // Server rejects /getOpenSubsonicExtensions but still returns a valid response
                    authMethod = 'saltedPassword';
                }
                return {
                    success: false,
                    error: 0,
                    url: correctUrl,
                }
            }

            // let authMethod = 'saltedPassword';
            // let serverData:Server = initialServer;
            // if (res.openSubsonicExtensions.find(e => e.name == 'apiKeyAuthentication')) {
            //     // TODO: Implement API Key auth
            //     // authMethod = 'apiKey';
            // } else {
            //     // Assume support for salted passwords
            // }
            // serverData = {
            //     auth: {

            //     }
            // }

            authMethod = res.openSubsonicExtensions?.find(e => e.name == 'apiKeyAuthentication') ? 'apiKey' : 'saltedPassword';

            const serverData: Server = {
                url: correctUrl,
                extensions: res.openSubsonicExtensions,
                version: res.serverVersion,
                authMethod,
                auth: {

                }
            }

            setServer(serverData);

            return {
                success: true,
                server: serverData,
                url: correctUrl,
            }
        } catch (error) {
            console.error(error);
            return {
                success: false,
                error: 'ERR_SERVER_UNREACHABLE',
                url: correctUrl,
            }
        }
    }, []);

    const saveAndTestPasswordCredentials = useCallback(async (username: string, password: string, serverOverride?: string, authMethodOverride?: Server['authMethod']) => {
        // TODO: Add error handling
        const url = serverOverride ? serverOverride : server.url;
        const authMethod = authMethodOverride ?? server.authMethod;

        if (authMethod === 'password') {
            try {
                const rawRes = await axios.get(`${url}/rest/ping`, {
                    params: {
                        c: `${config.clientName}/${config.clientVersion}`,
                        f: 'json',
                        v: config.protocolVersion,
                        u: username,
                        p: password,
                    }
                });
                const res = rawRes.data['subsonic-response'] as BaseResponse;
                if (res.status != 'ok') return false;

                setServer(s => ({ ...s, auth: { ...s.auth, username, password }, authMethod: 'password' }));
            } catch (error) {
                return false;
            }
            return true;
        }

        const { salt, hash } = await generateSubsonicToken(password);

        try {
            const rawRes = await axios.get(`${url}/rest/ping`, {
                params: {
                    c: `${config.clientName}/${config.clientVersion}`,
                    f: 'json',
                    v: config.protocolVersion,
                    u: username,
                    t: hash,
                    s: salt,
                }
            });
            const res = rawRes.data['subsonic-response'] as BaseResponse;
            if (res.status != 'ok') return false;

            setServer(s => ({ ...s, auth: { ...s.auth, username, password } }));
        } catch (error) {
            return false;
        }
        return true;
    }, [server.url]);

    const logOut = useCallback(async () => {
        setServer(initialServer);
        setServerAuth({});
        setConnection({ activeUrl: '', source: 'none', checking: false, reachable: null });
        await SecureStore.deleteItemAsync('password');
        await AsyncStorage.removeItem('server');
    }, []);

    return (
        <ServerContext.Provider value={{ server, serverAuth, connection, discoverServer, saveAndTestPasswordCredentials, setServerUrls, recheckConnection, isLoading, logOut }}>
            {children}
        </ServerContext.Provider>
    )
}