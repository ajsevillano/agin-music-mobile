import { Pressable, StyleSheet, TouchableOpacity, View } from 'react-native';
import { TouchableOpacityProps } from 'react-native-gesture-handler';
import { LibLayout } from '.';
import { useContext, useMemo } from 'react';
import ListItem from './ListItem';
import GridItem from './GridItem';
import React from 'react';
import GridCompactItem from './GridCompactItem';
import { Icon } from '@tabler/icons-react-native';
import { useColors, useQueue } from '@lib/hooks';
import { useOnPlaybackStateChange } from 'react-native-nitro-player';

export type TMediaLibItem = {
    id: string;
    title: string;
    subtitle?: string;
    coverUri?: string;
    coverCacheKey?: string;
    coverArt?: string;
    isAlbumEntry?: boolean;
    trackNumber?: number;
    type?: 'album' | 'artist' | 'track' | 'playlist';
    icon?: Icon;
}

export interface MediaLibItemProps extends TMediaLibItem, Omit<TouchableOpacityProps, 'id'> {
    rightSection?: React.ReactNode;
    index?: number;
    isActive?: boolean;
    isPlaying?: boolean;
}

function MediaLibItem({ id, title, subtitle, coverUri, coverCacheKey, rightSection, style, index, isAlbumEntry = false, trackNumber, type, icon, isActive: isActiveProp, isPlaying: isPlayingProp, ...props }: MediaLibItemProps) {
    const layout = useContext(LibLayout);
    const colors = useColors();
    const { nowPlaying } = useQueue();
    const { state } = useOnPlaybackStateChange();

    const isList = layout === 'list' || layout == null || layout === '';
    const isTrackRow = type !== 'album' && type !== 'artist' && type !== 'playlist';
    const isActive = isActiveProp ?? (isList && isTrackRow && id != null && id !== '' && nowPlaying.id === id);
    const isPlaying = isPlayingProp ?? (state !== 'paused' && state !== 'stopped');

    const ItemRenderer = (layout === 'grid' || layout == 'horizontal') ? GridItem : layout === 'list' ? ListItem : layout === 'gridCompact' ? GridCompactItem : View;

    const gridStyles = (index != undefined && layout == 'grid') && (index % 2 == 0 ? { marginRight: 5 } : { marginLeft: 5 });
    const compactGridStyles = (index != undefined && layout == 'gridCompact') && {
        marginRight: index % 3 != 2 ? 5 : 0,
        marginLeft: index % 3 != 0 ? 5 : 0,
    }

    const activeStyles = useMemo(() => StyleSheet.create({
        wrapper: {
            marginHorizontal: 12,
            borderRadius: 16,
            backgroundColor: colors.activeRowBackground,
            overflow: 'hidden',
        },
    }), [colors.activeRowBackground]);

    const wrappedRightSection = rightSection ? (
        <Pressable onPress={(e) => e.stopPropagation()} onStartShouldSetResponder={() => true}>
            {rightSection}
        </Pressable>
    ) : undefined;

    return (
        <View style={isActive && isList ? activeStyles.wrapper : undefined}>
            <TouchableOpacity activeOpacity={.8} style={[style, gridStyles, compactGridStyles]} {...props}>
                <ItemRenderer
                    id={id}
                    title={title}
                    subtitle={subtitle}
                    coverUri={coverUri}
                    coverCacheKey={coverCacheKey}
                    rightSection={wrappedRightSection}
                    isAlbumEntry={isAlbumEntry}
                    trackNumber={trackNumber}
                    type={type}
                    icon={icon}
                    isActive={isActive}
                    isPlaying={isPlaying}
                />
            </TouchableOpacity>
        </View>
    )
}

export default React.memo(MediaLibItem);
