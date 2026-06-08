import axios from 'axios';
import { createContext, useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useNetworkState } from 'expo-network';
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
};

/** How long to wait for the local URL to answer before falling back to the remote one. */
const PROBE_TIMEOUT = 2500;

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
    connection: { activeUrl: '', source: 'none', checking: false },
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
async function pingUrl(url: string, params: Record<string, string>): Promise<boolean> {
    try {
        const res = await axios.get(`${url}/rest/ping`, { params, timeout: PROBE_TIMEOUT });
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
    const [connection, setConnection] = useState<ConnectionInfo>({ activeUrl: '', source: 'none', checking: false });

    const network = useNetworkState();

    // Always-fresh values for use inside listeners/probes without re-subscribing.
    const serverRef = useRef(server);
    const serverAuthRef = useRef(serverAuth);
    serverRef.current = server;
    serverAuthRef.current = serverAuth;

    // Increments on each resolve so a slow probe can't override a newer result.
    const resolveIdRef = useRef(0);

    const applyActiveUrl = useCallback((url: string, source: ActiveUrlSource) => {
        setServer(prev => (prev.url === url ? prev : { ...prev, url }));
        setConnection({ activeUrl: url, source, checking: false });
    }, []);

    const resolveAndApply = useCallback(async () => {
        const runId = ++resolveIdRef.current;
        const s = serverRef.current;
        const local = s.localUrl?.trim() || '';
        const remote = s.remoteUrl?.trim() || '';

        // No dual config: keep whatever single URL we have (legacy / fresh login).
        if (!local && !remote) {
            setConnection({ activeUrl: s.url, source: s.url ? 'single' : 'none', checking: false });
            return;
        }
        if (local && !remote) return applyActiveUrl(local, 'local');
        if (!local && remote) return applyActiveUrl(remote, 'remote');

        // Both set: try the local URL first, fall back to the remote one.
        const params = buildPingParams(s, serverAuthRef.current);
        if (!params) {
            // Can't probe yet (no credentials) — prefer local optimistically.
            return applyActiveUrl(local, 'local');
        }
        setConnection(c => ({ ...c, checking: true }));
        const localReachable = await pingUrl(local, params);
        if (runId !== resolveIdRef.current) return; // superseded by a newer resolve
        applyActiveUrl(localReachable ? local : remote, localReachable ? 'local' : 'remote');
    }, [applyActiveUrl]);

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

    // Re-resolve the active URL whenever the config, credentials or network change.
    useEffect(() => {
        if (isLoading) return;
        resolveAndApply();
    }, [isLoading, server.localUrl, server.remoteUrl, server.auth.username, server.auth.password, server.authMethod, serverAuth.hash, serverAuth.salt, network.isConnected, network.isInternetReachable, network.type, resolveAndApply]);

    // Re-probe when the app returns to the foreground (e.g. you got home / left).
    useEffect(() => {
        const sub = AppState.addEventListener('change', state => {
            if (state === 'active' && !isLoading) resolveAndApply();
        });
        return () => sub.remove();
    }, [isLoading, resolveAndApply]);

    const setServerUrls = useCallback((localUrl: string, remoteUrl: string) => {
        const normLocal = localUrl.trim() ? fixUrl(localUrl.trim()) : '';
        const normRemote = remoteUrl.trim() ? fixUrl(remoteUrl.trim()) : '';
        setServer(prev => ({ ...prev, localUrl: normLocal, remoteUrl: normRemote }));
    }, []);

    const recheckConnection = useCallback(() => {
        resolveAndApply();
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
        setConnection({ activeUrl: '', source: 'none', checking: false });
        await SecureStore.deleteItemAsync('password');
        await AsyncStorage.removeItem('server');
    }, []);

    return (
        <ServerContext.Provider value={{ server, serverAuth, connection, discoverServer, saveAndTestPasswordCredentials, setServerUrls, recheckConnection, isLoading, logOut }}>
            {children}
        </ServerContext.Provider>
    )
}