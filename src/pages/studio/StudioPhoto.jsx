import React from 'react';
import { Camera } from 'lucide-react';
import RetouchFeature from './RetouchFeature';
import { RETOUCH_STYLES, DEFAULT_STYLE } from '../../lib/retouch';

export default function StudioPhoto({ onBack }) {
  return (
    <RetouchFeature
      onBack={onBack}
      mode="retouch"
      kind="studio_photo"
      icon={Camera}
      title="Studio Photo"
      sub="Turn a plain counter photo into a clean, studio-lit product shot."
      styleOptions={RETOUCH_STYLES}
      defaultStyle={DEFAULT_STYLE}
    />
  );
}
