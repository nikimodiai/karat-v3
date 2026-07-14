import React, { useState } from 'react';
import {
  Wand2, Gem, Sparkles, Camera, Repeat, Film, Images, ArrowLeft, Lock,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { effectiveLimit, hasFeature } from '../lib/plans';
import { suiteUnitsLeft, suiteUsageText } from '../lib/studioSuite';
import DesignStudio from './DesignStudio';
import AIModelStudio from './studio/AIModelStudio';
import StudioPhoto from './studio/StudioPhoto';
import MetalSwap from './studio/MetalSwap';
import ReelStudio from './studio/ReelStudio';
import StudioLibrary from './studio/StudioLibrary';
import styles from './StudioSuite.module.css';

// The six Studio Suite features. `render` gets an { onBack } prop so each
// feature can return to the hub. All of them charge the single shared meter
// (stores._ai_studio_suite_used) — see src/lib/studioSuite.js.
const FEATURES = [
  {
    id: 'studio_photo',
    label: 'Studio Photo',
    desc: 'Turn a plain product photo into a clean, studio-lit shot.',
    icon: Camera,
    render: (props) => <StudioPhoto {...props} />,
  },
  {
    id: 'metal_swap',
    label: 'Metal Swap',
    desc: 'Recolour a piece into yellow, white or rose gold — instantly.',
    icon: Repeat,
    render: (props) => <MetalSwap {...props} />,
  },
  {
    id: 'jewellery_design',
    label: 'Jewellery Design',
    desc: 'Design a piece field by field, price it, and publish to your catalog.',
    icon: Gem,
    render: (props) => <DesignStudio {...props} />,
  },
  {
    id: 'ai_model',
    label: 'AI Model',
    desc: 'Put your jewellery on a photorealistic model — then add it to Inventory.',
    icon: Sparkles,
    render: (props) => <AIModelStudio {...props} />,
  },
  {
    id: 'reels',
    label: 'Generate Reels',
    desc: 'Turn your photos into a short, shareable video with motion and music.',
    icon: Film,
    render: (props) => <ReelStudio {...props} />,
  },
  {
    id: 'library',
    label: 'Library',
    desc: 'Every photo and video you’ve generated with Studio Suite.',
    icon: Images,
    render: (props) => <StudioLibrary {...props} />,
  },
];

export default function StudioSuite({ onNavigate }) {
  const { store } = useAuth();
  const [active, setActive] = useState(null); // null = hub, else feature id

  const featureOn = hasFeature(store, 'ai_studio_suite');
  const limit = effectiveLimit(store, 'ai_studio_suite');
  const left = suiteUnitsLeft(store);
  const usageText = suiteUsageText(store);

  // A feature is open — render it with a back handler + tab navigation.
  if (active) {
    const feat = FEATURES.find((f) => f.id === active);
    if (feat) return feat.render({ onBack: () => setActive(null), onNavigate });
  }

  // Plan doesn't unlock Studio Suite at all (shouldn't happen — it's on for
  // every plan — but keep the guard so a future plan can gate it).
  if (!featureOn) {
    return (
      <div className={styles.page}>
        <div className={styles.lock}>
          <Lock size={30} strokeWidth={1.4} />
          <h2>AI Studio Suite isn’t available on your plan</h2>
          <p>Upgrade to generate studio photos, AI models, jewellery designs and reels.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}><Wand2 size={20} /> AI Studio Suite</h1>
          <p className={styles.sub}>
            AI tools to shoot, restyle, design and animate your jewellery — all in one place.
          </p>
        </div>
        {usageText && (
          <div className={styles.meter} title="Shared across every Studio Suite feature this month">
            <span className={styles.meterLabel}>Studio Credits</span>
            <span className={styles.meterValue}>{usageText}</span>
            <div className={styles.meterBar}>
              <div
                className={styles.meterFill}
                style={{ width: `${limit === Infinity ? 0 : Math.min(100, Math.round(((limit - left) / limit) * 100))}%` }}
              />
            </div>
          </div>
        )}
      </div>

      <div className={styles.grid}>
        {FEATURES.map(({ id, label, desc, icon: Icon }) => (
          <button key={id} className={styles.tile} onClick={() => setActive(id)}>
            <div className={styles.tileIcon}><Icon size={22} strokeWidth={1.7} /></div>
            <div className={styles.tileBody}>
              <h3 className={styles.tileTitle}>{label}</h3>
              <p className={styles.tileDesc}>{desc}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// Shared sub-feature header — a back button + title, reused by every feature
// screen so they all return to the hub consistently.
export function SuiteFeatureHeader({ onBack, icon: Icon, title, sub, right }) {
  return (
    <div className={styles.featHeader}>
      <button className={styles.backBtn} onClick={onBack}>
        <ArrowLeft size={16} /> AI Studio Suite
      </button>
      <div className={styles.featTitleRow}>
        <div className={styles.featTitleLeft}>
          <h1 className={styles.title}>{Icon ? <Icon size={20} /> : null} {title}</h1>
          {sub && <p className={styles.sub}>{sub}</p>}
        </div>
        {right}
      </div>
    </div>
  );
}
