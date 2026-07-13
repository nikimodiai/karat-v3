import React from 'react';
import { Repeat } from 'lucide-react';
import RetouchFeature from './RetouchFeature';
import {
  TARGET_METALS, DEFAULT_TARGET_METAL,
  METAL_SWAP_STYLES, METAL_SWAP_DEFAULT_STYLE,
} from '../../lib/retouch';

export default function MetalSwap({ onBack }) {
  return (
    <RetouchFeature
      onBack={onBack}
      mode="variant"
      kind="metal_swap"
      icon={Repeat}
      title="Metal Swap"
      sub="Preview a piece in another metal — same design, same stones, just a new colour."
      styleOptions={METAL_SWAP_STYLES}
      defaultStyle={METAL_SWAP_DEFAULT_STYLE}
      metalOptions={TARGET_METALS}
      defaultMetal={DEFAULT_TARGET_METAL}
    />
  );
}
