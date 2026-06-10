import { useMemo } from 'react';
import { useServer } from './useServer';
import axios from 'axios';
import { useSubsonicParams } from './useSubsonicParams';

export function useApi() {
    const { server } = useServer();
    const params = useSubsonicParams();

    const api = useMemo(() => {
        return params != null ? axios.create({
            baseURL: `${server.url}/rest/`,
            params,
            // Fail fast on a dead address instead of hanging until the OS TCP
            // timeout, which would let a stale request clobber the status later.
            timeout: 15000,
        }) : null
    }, [server, params]);

    return api;
}