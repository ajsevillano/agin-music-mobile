import { useContext } from 'react';
import { ConnectionContext } from '@lib/providers/ConnectionProvider';

export function useConnection() {
    return useContext(ConnectionContext);
}
