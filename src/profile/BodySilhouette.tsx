import { View } from 'react-native';

import type { BodyType, Gender } from './types';

type Shape = { shoulders: number; waist: number; hips: number; legs: number };

/** Widths as a share of the figure's width. Neutral, schematic shapes, not portraits. */
const SHAPES: Record<Gender, Record<BodyType, Shape>> = {
  woman: {
    slim: { shoulders: 0.5, waist: 0.34, hips: 0.5, legs: 0.2 },
    athletic: { shoulders: 0.6, waist: 0.4, hips: 0.54, legs: 0.23 },
    average: { shoulders: 0.56, waist: 0.44, hips: 0.6, legs: 0.25 },
    curvy: { shoulders: 0.58, waist: 0.42, hips: 0.72, legs: 0.3 },
    plus: { shoulders: 0.68, waist: 0.64, hips: 0.8, legs: 0.34 },
  },
  man: {
    slim: { shoulders: 0.56, waist: 0.4, hips: 0.44, legs: 0.2 },
    athletic: { shoulders: 0.76, waist: 0.46, hips: 0.5, legs: 0.23 },
    average: { shoulders: 0.66, waist: 0.52, hips: 0.54, legs: 0.24 },
    curvy: { shoulders: 0.68, waist: 0.6, hips: 0.62, legs: 0.27 },
    plus: { shoulders: 0.78, waist: 0.78, hips: 0.76, legs: 0.32 },
  },
  unspecified: {
    slim: { shoulders: 0.53, waist: 0.37, hips: 0.47, legs: 0.2 },
    athletic: { shoulders: 0.68, waist: 0.43, hips: 0.52, legs: 0.23 },
    average: { shoulders: 0.61, waist: 0.48, hips: 0.57, legs: 0.25 },
    curvy: { shoulders: 0.63, waist: 0.51, hips: 0.67, legs: 0.28 },
    plus: { shoulders: 0.73, waist: 0.71, hips: 0.78, legs: 0.33 },
  },
};

/** A schematic figure built from simple shapes, used to pick a body type. */
export function BodySilhouette({
  gender,
  bodyType,
  color,
  height = 120,
}: {
  gender: Gender | null;
  bodyType: BodyType;
  color: string;
  height?: number;
}) {
  const shape = SHAPES[gender ?? 'unspecified'][bodyType];
  const width = height * 0.5;
  const head = height * 0.14;
  const band = (share: number, bandHeight: number, radius: number) => ({
    width: width * share,
    height: bandHeight,
    backgroundColor: color,
    borderRadius: radius,
  });
  return (
    <View style={{ width, height, alignItems: 'center' }}>
      <View style={{ width: head, height: head, borderRadius: head / 2, backgroundColor: color }} />
      <View style={{ height: height * 0.02 }} />
      <View style={band(shape.shoulders, height * 0.16, height * 0.05)} />
      <View style={band(shape.waist, height * 0.12, 0)} />
      <View style={band(shape.hips, height * 0.14, height * 0.04)} />
      <View style={{ flexDirection: 'row', gap: width * 0.06 }}>
        <View style={band(shape.legs, height * 0.4, height * 0.04)} />
        <View style={band(shape.legs, height * 0.4, height * 0.04)} />
      </View>
    </View>
  );
}
