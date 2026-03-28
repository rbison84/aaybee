import React from 'react';
import { Image } from 'react-native';

export type CatPose = 'sat' | 'left' | 'right' | 'arms';

const CAT_IMAGES = {
  sat: require('../../../assets/AaybeeCat.png'),
  left: require('../../../assets/AaybeeLeftPose.png'),
  right: require('../../../assets/AaybeeRightPose.png'),
  arms: require('../../../assets/AaybeeArms.png'),
};

interface CatMascotProps {
  pose?: CatPose;
  size?: number;
}

export function CatMascot({ pose = 'sat', size = 120 }: CatMascotProps) {
  return (
    <Image
      source={CAT_IMAGES[pose]}
      style={{
        width: size,
        height: size,
        // Ensure no background
        backgroundColor: 'transparent',
      }}
      resizeMode="contain"
    />
  );
}
